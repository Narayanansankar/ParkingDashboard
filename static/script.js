$(document).ready(function() {
    let singleLotChart;
    let overallHistoryChart;

    function createParkingCard(lot, columnClass) {
        const occupancyPercent = lot.occupancyPercent;
        let progressBarColor = 'bg-success';
        if (occupancyPercent > 85) progressBarColor = 'bg-danger';
        else if (occupancyPercent > 50) progressBarColor = 'bg-warning';

        return `
            <div class="${columnClass}">
                <div class="card parking-card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span>${lot.Parking_name_en}</span>
                        <span class="availability-status ${lot.IsParkingAvailable ? 'status-available' : 'status-unavailable'}">
                            ${lot.IsParkingAvailable ? 'Available' : 'Closed'}
                        </span>
                    </div>
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">Occupancy: ${lot.Current_Vehicle} / ${lot.TotalCapacity}</h5>
                        <div class="progress mb-3" role="progressbar" aria-valuenow="${occupancyPercent}" aria-valuemin="0" aria-valuemax="100">
                            <div class="progress-bar ${progressBarColor} fw-bold" style="width: ${occupancyPercent}%;">${Math.round(occupancyPercent)}%</div>
                        </div>
                    </div>
                    <div class="card-footer bg-white text-end">
                        <button class="btn btn-outline-secondary btn-sm view-history-btn" 
                                data-bs-toggle="modal" 
                                data-bs-target="#lotHistoryModal" 
                                data-parking-id="${lot.ParkingLotID}">
                            View History
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function fetchAndRenderData() {
        $.getJSON('/api/parking-data', function(response) {
            const lots = response.data;
            const lastUpdated = new Date(response.last_updated);
            $('#last-updated').text(lastUpdated.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
            let totalCurrentVehicles = 0;
            let totalOverallCapacity = 0;
            $('#thoothukudi-lots-container, #tirunelveli-lots-container, #nagercoil-lots-container').empty();
            lots.forEach(lot => {
                totalCurrentVehicles += lot.Current_Vehicle;
                totalOverallCapacity += lot.TotalCapacity;
                lot.occupancyPercent = lot.TotalCapacity > 0 ? (lot.Current_Vehicle / lot.TotalCapacity) * 100 : 0;
            });
            const overallOccupancyPercent = totalOverallCapacity > 0 ? (totalCurrentVehicles / totalOverallCapacity) * 100 : 0;
            let overallProgressBarColor = 'bg-success';
            if (overallOccupancyPercent > 85) overallProgressBarColor = 'bg-danger';
            else if (overallOccupancyPercent > 50) overallProgressBarColor = 'bg-warning';
            const $progressBar = $('#overall-progress-bar');
            $progressBar.css('width', overallOccupancyPercent + '%').attr('aria-valuenow', overallOccupancyPercent).text(Math.round(overallOccupancyPercent) + '%').removeClass('bg-success bg-warning bg-danger').addClass(overallProgressBarColor);
            $('#total-vehicles').text(totalCurrentVehicles);
            $('#total-capacity').text(totalOverallCapacity);
            lots.sort((a, b) => b.occupancyPercent - a.occupancyPercent);
            lots.forEach(lot => {
                const routeEn = lot.Route_en.toLowerCase().trim();
                let cardHtml;
                if (routeEn === 'thoothukudi') { cardHtml = createParkingCard(lot, 'col-md-6'); $('#thoothukudi-lots-container').append(cardHtml); } 
                else if (routeEn === 'tirunelveli') { cardHtml = createParkingCard(lot, 'col-md-6'); $('#tirunelveli-lots-container').append(cardHtml); } 
                else if (routeEn === 'nagercoil') { cardHtml = createParkingCard(lot, 'col-12'); $('#nagercoil-lots-container').append(cardHtml); }
            });
        });
    }

    function fetchAndRenderOverallHistoryChart() {
        $.getJSON('/api/overall-history', function(data) {
            const ctx = document.getElementById('overallHistoryChart').getContext('2d');
            if (overallHistoryChart) { overallHistoryChart.destroy(); }
            overallHistoryChart = new Chart(ctx, { type: 'line', data: { datasets: data.datasets },
                options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { position: 'nearest' } },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'Total Vehicle Count' } }, x: { type: 'time', time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h a' } } } }
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
            singleLotChart = new Chart(ctx, { type: 'line', data: { datasets: data.datasets },
                options: { responsive: true, maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Occupancy (%)' } }, x: { type: 'time', time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h:mm a' } }, title: { display: true, text: 'Time' } } }
                }
            });
        }).fail(function() { $('#lotHistoryModalLabel').text('Error'); $('#modal-loading-text').text('Could not load historical data.'); });
    });

    // Initial data fetch
    fetchAndRenderData();
    fetchAndRenderOverallHistoryChart();
    
    // Auto-refresh the data every 5 minutes
    setInterval(fetchAndRenderData, 5 * 60 * 1000);
    setInterval(fetchAndRenderOverallHistoryChart, 5 * 60 * 1000);
});
