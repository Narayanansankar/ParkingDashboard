$(document).ready(function() {
    let singleLotChart;
    let overallHistoryChart;
    const darkTextColor = '#333333'; // Define a dark color for chart text

    function createParkingCard(lot, columnClass) {
        const occupancyPercent = lot.Occupancy_Percent;
        let progressBarColor = 'bg-success';
        if (occupancyPercent > 85) progressBarColor = 'bg-danger';
        else if (occupancyPercent > 50) progressBarColor = 'bg-warning';
        
        const statusText = lot.IsParkingAvailable ? 'Available' : 'Closed';
        const statusClass = lot.IsParkingAvailable ? 'status-available' : 'status-unavailable';

        const buttonGroup = `
            <div class="d-flex align-items-center">
                <div class="btn-group me-2" role="group">
                    <a href="${lot.Location_Link}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Location"><i class="bi bi-geo-alt"></i></a>
                    <a href="${lot.Photos_Link}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Photos"><i class="bi bi-camera"></i></a>
                    <button class="btn btn-sm btn-outline-secondary view-history-btn" 
                            data-bs-toggle="modal" 
                            data-bs-target="#lotHistoryModal" 
                            title="View History"
                            data-parking-id="${lot.ParkingLotID}">
                        <i class="bi bi-clock-history"></i>
                    </button>
                </div>
                <span class="availability-status ${statusClass}">${statusText}</span>
            </div>
        `;

        return `
            <div class="${columnClass}">
                <div class="card parking-card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="fw-bold parking-name">${lot.Parking_name_en}</span>
                            ${buttonGroup}
                        </div>
                        <hr class="my-1">
                        <h6 class="card-title text-muted mb-1">Occupancy: ${lot.Current_Vehicle} / ${lot.TotalCapacity}</h6>
                        <div class="progress" role="progressbar" aria-valuenow="${occupancyPercent}" aria-valuemin="0" aria-valuemax="100" style="height: 20px;">
                            <div class="progress-bar ${progressBarColor} fw-bold" style="width: ${occupancyPercent}%;">${Math.round(occupancyPercent)}%</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function updateRouteProgressBar(routeName, current, total) {
        const percent = total > 0 ? (current / total) * 100 : 0;
        let progressBarColor = 'bg-success';
        if (percent > 85) progressBarColor = 'bg-danger';
        else if (percent > 50) progressBarColor = 'bg-warning';
        
        const routeId = routeName.toLowerCase();
        const $progressBar = $(`#${routeId}-route-progress`);
        
        $progressBar
            .css('width', percent + '%')
            .text(Math.round(percent) + '%')
            .removeClass('bg-success bg-warning bg-danger')
            .addClass(progressBarColor);
        
        $(`#${routeId}-route-count`).text(`${current} / ${total}`);
    }

    function fetchAndRenderData() {
        $.getJSON('/api/parking-data', function(response) {
            const lots = response.data;
            const lastUpdated = new Date(response.last_updated);
            $('#last-updated').text(lastUpdated.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
            
            let totalCurrentVehicles = 0;
            let totalOverallCapacity = 0;

            const routeStats = {
                'Thoothukudi': { current: 0, total: 0 },
                'Tirunelveli': { current: 0, total: 0 },
                'Nagercoil': { current: 0, total: 0 }
            };

            $('#thoothukudi-lots-container, #tirunelveli-lots-container, #nagercoil-lots-container').empty();
            
            lots.forEach(lot => {
                totalCurrentVehicles += lot.Current_Vehicle;
                totalOverallCapacity += lot.TotalCapacity;

                if (routeStats[lot.Route_en]) {
                    routeStats[lot.Route_en].current += lot.Current_Vehicle;
                    routeStats[lot.Route_en].total += lot.TotalCapacity;
                }
            });

            const overallOccupancyPercent = totalOverallCapacity > 0 ? (totalCurrentVehicles / totalOverallCapacity) * 100 : 0;
            let overallProgressBarColor = 'bg-success';
            if (overallOccupancyPercent > 85) overallProgressBarColor = 'bg-danger';
            else if (overallOccupancyPercent > 50) overallProgressBarColor = 'bg-warning';
            const $progressBar = $('#overall-progress-bar');
            $progressBar.css('width', overallOccupancyPercent + '%').attr('aria-valuenow', overallOccupancyPercent).text(Math.round(overallOccupancyPercent) + '%').removeClass('bg-success bg-warning bg-danger').addClass(overallProgressBarColor);
            $('#total-vehicles').text(totalCurrentVehicles.toLocaleString());
            $('#total-capacity').text(totalOverallCapacity.toLocaleString());

            for (const routeName in routeStats) {
                updateRouteProgressBar(routeName, routeStats[routeName].current, routeStats[routeName].total);
            }

            lots.sort((a, b) => b.Occupancy_Percent - a.Occupancy_Percent);
            lots.forEach(lot => {
                const routeEn = lot.Route_en.toLowerCase().trim();
                const cardHtml = createParkingCard(lot, 'col-md-12'); 
                if (routeEn === 'thoothukudi') { $('#thoothukudi-lots-container').append(cardHtml); } 
                else if (routeEn === 'tirunelveli') { $('#tirunelveli-lots-container').append(cardHtml); } 
                else if (routeEn === 'nagercoil') { $('#nagercoil-lots-container').append(cardHtml); }
            });
        });
    }

    function fetchAndRenderOverallHistoryChart() {
        $.getJSON('/api/overall-history', function(data) {
            const ctx = document.getElementById('overallHistoryChart').getContext('2d');
            if (overallHistoryChart) { overallHistoryChart.destroy(); }
            overallHistoryChart = new Chart(ctx, {
                type: 'line',
                data: { datasets: data.datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        tooltip: { position: 'nearest' },
                        legend: {
                            labels: {
                                color: darkTextColor, // Darken legend text
                                font: { weight: 'bold' }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Total Vehicle Count',
                                color: darkTextColor, // Darken Y-axis title
                                font: { weight: 'bold' }
                            },
                            ticks: {
                                color: darkTextColor // Darken Y-axis tick labels
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)' // Slightly darken grid lines
                            }
                        },
                        x: {
                            type: 'time',
                            time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h a' } },
                            ticks: {
                                color: darkTextColor // Darken X-axis tick labels
                            },
                             grid: {
                                color: 'rgba(0, 0, 0, 0.1)' // Slightly darken grid lines
                            }
                        }
                    }
                }
            });
        });
    }

    $('#lotHistoryModal').on('show.bs.modal', function(event) {
        const button = event.relatedTarget;
        const parkingLotID = button.getAttribute('data-parking-id');
        $('#modal-loading-text').show();
        $('#singleLotChart').hide();
        if (singleLotChart) { singleLotChart.destroy(); }
        $.getJSON(`/api/parking-lot-history?id=${parkingLotID}`, function(data) {
            $('#lotHistoryModalLabel').text(`Last 24-Hour History for ${data.lotName}`);
            $('#modal-loading-text').hide();
            $('#singleLotChart').show();
            const ctx = document.getElementById('singleLotChart').getContext('2d');
            singleLotChart = new Chart(ctx, {
                type: 'line',
                data: { datasets: data.datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: darkTextColor, // Darken legend text
                                font: { weight: 'bold' }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Occupancy (%)',
                                color: darkTextColor, // Darken Y-axis title
                                font: { weight: 'bold' }
                            },
                            ticks: {
                                color: darkTextColor // Darken Y-axis tick labels
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            type: 'time',
                            time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h:mm a' } },
                            title: {
                                display: true,
                                text: 'Time',
                                color: darkTextColor, // Darken X-axis title
                                font: { weight: 'bold' }
                            },
                            ticks: {
                                color: darkTextColor // Darken X-axis tick labels
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    }
                }
            });
        }).fail(function() { $('#lotHistoryModalLabel').text('Error'); $('#modal-loading-text').text('Could not load historical data.'); });
    });

    // Initial data fetch
    fetchAndRenderData();
    fetchAndRenderOverallHistoryChart();
    
    // Auto-refresh the data
    setInterval(fetchAndRenderData, 5 * 60 * 1000);
    setInterval(fetchAndRenderOverallHistoryChart, 5 * 60 * 1000);
});
