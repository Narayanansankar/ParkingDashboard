$(document).ready(function() {
    let singleLotChart;
    let overallHistoryChart;

    function createParkingCard(lot, columnClass) {
        const occupancyPercent = lot.Occupancy_Percent;
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
                        <div class="progress mb-3" role="progressbar">
                            <div class="progress-bar ${progressBarColor} fw-bold" style="width: ${occupancyPercent}%;">${Math.round(occupancyPercent)}%</div>
                        </div>
                        <p class="card-text notes mt-auto">${lot.Notes_en}</p>
                    </div>
                    <div class="card-footer bg-white text-center">
                        <button class="btn btn-outline-secondary btn-sm view-history-btn" 
                                data-bs-toggle="modal" data-bs-target="#lotHistoryModal" 
                                data-parking-id="${lot.ParkingLotID}">
                            View History
                        </button>
                    </div>
                </div>
            </div>`;
    }

    function createRouteSummaryBar(summary) {
        const occupancyPercent = summary.occupancy_percent;
        let progressBarColor = 'bg-success';
        if (occupancyPercent > 85) progressBarColor = 'bg-danger';
        else if (occupancyPercent > 50) progressBarColor = 'bg-warning';

        return `
            <div>
                <p class="mb-1 fw-bold text-muted">Route Occupancy: ${summary.total_vehicles} / ${summary.total_capacity}</p>
                <div class="progress" style="height: 20px;" role="progressbar">
                    <div class="progress-bar ${progressBarColor} fw-bold" style="width: ${occupancyPercent}%;">${Math.round(occupancyPercent)}%</div>
                </div>
            </div>`;
    }

    function fetchAndRenderData() {
        $.getJSON('/api/parking-data', function(response) {
            const lots = response.lots;
            const routeSummary = response.route_summary;
            $('#last-updated').text(new Date(response.last_updated).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));

            $('#thoothukudi-lots-container, #tirunelveli-lots-container, #nagercoil-lots-container').empty();
            $('#thoothukudi-summary-container, #tirunelveli-summary-container, #nagercoil-summary-container').empty();

            if (routeSummary.Thoothukudi) $('#thoothukudi-summary-container').html(createRouteSummaryBar(routeSummary.Thoothukudi));
            if (routeSummary.Tirunelveli) $('#tirunelveli-summary-container').html(createRouteSummaryBar(routeSummary.Tirunelveli));
            if (routeSummary.Nagercoil) $('#nagercoil-summary-container').html(createRouteSummaryBar(routeSummary.Nagercoil));

            let totalCurrentVehicles = 0;
            let totalOverallCapacity = 0;
            lots.forEach(lot => {
                totalCurrentVehicles += lot.Current_Vehicle;
                totalOverallCapacity += lot.TotalCapacity;
            });

            const overallOccupancyPercent = totalOverallCapacity > 0 ? (totalCurrentVehicles / totalOverallCapacity) * 100 : 0;
            let overallProgressBarColor = 'bg-success';
            if (overallOccupancyPercent > 85) overallProgressBarColor = 'bg-danger';
            else if (overallOccupancyPercent > 50) overallProgressBarColor = 'bg-warning';

            $('#overall-progress-bar').css('width', overallOccupancyPercent + '%')
                .attr('aria-valuenow', overallOccupancyPercent).text(Math.round(overallOccupancyPercent) + '%')
                .removeClass('bg-success bg-warning bg-danger').addClass(overallProgressBarColor);

            $('#total-vehicles').text(totalCurrentVehicles);
            $('#total-capacity').text(totalOverallCapacity);

            lots.sort((a, b) => b.Occupancy_Percent - a.Occupancy_Percent);
            lots.forEach(lot => {
                const routeEn = lot.Route_en.toLowerCase().trim();
                if (routeEn === 'thoothukudi') $('#thoothukudi-lots-container').append(createParkingCard(lot, 'col-md-6'));
                else if (routeEn === 'tirunelveli') $('#tirunelveli-lots-container').append(createParkingCard(lot, 'col-md-6'));
                else if (routeEn === 'nagercoil') $('#nagercoil-lots-container').append(createParkingCard(lot, 'col-12'));
            });
        });
    }

    function fetchAndRenderOverallHistoryChart() {
        $.getJSON('/api/overall-history', function(data) {
            if (overallHistoryChart) overallHistoryChart.destroy();
            overallHistoryChart = new Chart(document.getElementById('overallHistoryChart').getContext('2d'), {
                type: 'line', data: { datasets: data.datasets },
                options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'Total Vehicle Count' } },
                        x: { type: 'time', time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h a' } } }
                    }
                }
            });
        });
    }

    $('#lotHistoryModal').on('show.bs.modal', function(event) {
        const parkingLotID = event.relatedTarget.getAttribute('data-parking-id');
        $('#modal-loading-text').show();
        $('#singleLotChart').hide();
        if (singleLotChart) singleLotChart.destroy();

        $.getJSON(`/api/parking-lot-history?id=${parkingLotID}`, function(data) {
            $('#lotHistoryModalLabel').text(`Last 24-Hour History for ${data.lotName}`);
            $('#modal-loading-text').hide();
            $('#singleLotChart').show();
            singleLotChart = new Chart(document.getElementById('singleLotChart').getContext('2d'), {
                type: 'line', data: { datasets: data.datasets },
                options: { responsive: true, maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Occupancy (%)' } },
                        x: { type: 'time', time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h:mm a' } }, title: { display: true, text: 'Time' } }
                    }
                }
            });
        }).fail(function() {
            $('#lotHistoryModalLabel').text('Error');
            $('#modal-loading-text').text('Could not load historical data. Please try again later.');
        });
    });

    fetchAndRenderData();
    fetchAndRenderOverallHistoryChart();
    setInterval(fetchAndRenderData, 5 * 60 * 1000);
    setInterval(fetchAndRenderOverallHistoryChart, 5 * 60 * 1000);
});
