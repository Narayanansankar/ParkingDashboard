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
                        <div>
                            <span class="lang-en">${lot.Parking_name_en}</span>
                            <span class="lang-ta" style="display:none;">${lot.Parking_name_ta}</span>
                        </div>
                        <span class="availability-status ${lot.IsParkingAvailable ? 'status-available' : 'status-unavailable'}">
                            <span class="lang-en">${lot.IsParkingAvailable ? 'Available' : 'Closed'}</span>
                            <span class="lang-ta" style="display:none;">${lot.IsParkingAvailable ? 'திறந்துள்ளது' : 'மூடப்பட்டுள்ளது'}</span>
                        </span>
                    </div>
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">
                            <span class="lang-en">Occupancy: ${lot.Current_Vehicle} / ${lot.TotalCapacity}</span>
                            <span class="lang-ta" style="display:none;">நிரம்பியது: ${lot.Current_Vehicle} / ${lot.TotalCapacity}</span>
                        </h5>
                        <div class="progress mb-3" role="progressbar" aria-valuenow="${occupancyPercent}" aria-valuemin="0" aria-valuemax="100">
                            <div class="progress-bar ${progressBarColor} fw-bold" style="width: ${occupancyPercent}%;">${Math.round(occupancyPercent)}%</div>
                        </div>
                        <p class="card-text notes mt-auto">
                            <span class="lang-en">${lot.Notes_en}</span>
                            <span class="lang-ta" style="display:none;">${lot.Notes_ta || lot.Notes_en}</span>
                        </p>
                    </div>
                    <div class="card-footer bg-white text-center">
                        <button class="btn btn-outline-secondary btn-sm view-history-btn" 
                                data-bs-toggle="modal" data-bs-target="#lotHistoryModal" 
                                data-parking-id="${lot.ParkingLotID}">
                            <span class="lang-en">View History</span>
                            <span class="lang-ta" style="display:none;">வரலாறு காண்க</span>
                        </button>
                    </div>
                </div>
            </div>`;
    }

    // *** NEW: Function to create route summary bars ***
    function createRouteSummaryBar(summary) {
        const occupancyPercent = summary.occupancy_percent;
        let progressBarColor = 'bg-success';
        if (occupancyPercent > 85) progressBarColor = 'bg-danger';
        else if (occupancyPercent > 50) progressBarColor = 'bg-warning';

        return `
            <div>
                <p class="mb-1 fw-bold text-muted">
                    <span class="lang-en">Route Occupancy: ${summary.total_vehicles} / ${summary.total_capacity}</span>
                    <span class="lang-ta" style="display:none;">வழித்தட நிரம்பியது: ${summary.total_vehicles} / ${summary.total_capacity}</span>
                </p>
                <div class="progress" style="height: 20px;" role="progressbar" aria-valuenow="${occupancyPercent}" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar ${progressBarColor} fw-bold" style="width: ${occupancyPercent}%;">${Math.round(occupancyPercent)}%</div>
                </div>
            </div>`;
    }

    function fetchAndRenderData() {
        $.getJSON('/api/parking-data', function(response) {
            const lots = response.lots; // Use the 'lots' key
            const routeSummary = response.route_summary; // Get the new summary data
            const lastUpdated = new Date(response.last_updated);
            
            $('#last-updated').text(lastUpdated.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
            $('#last-updated-ta').text(lastUpdated.toLocaleString('ta-IN', { dateStyle: 'medium', timeStyle: 'short' }));

            // Clear previous data
            $('#thoothukudi-lots-container, #tirunelveli-lots-container, #nagercoil-lots-container').empty();
            $('#thoothukudi-summary-container, #tirunelveli-summary-container, #nagercoil-summary-container').empty();

            // Render Route Summaries
            if (routeSummary.Thoothukudi) $('#thoothukudi-summary-container').html(createRouteSummaryBar(routeSummary.Thoothukudi));
            if (routeSummary.Tirunelveli) $('#tirunelveli-summary-container').html(createRouteSummaryBar(routeSummary.Tirunelveli));
            if (routeSummary.Nagercoil) $('#nagercoil-summary-container').html(createRouteSummaryBar(routeSummary.Nagercoil));

            // Calculate Overall Summary
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

            $('#total-vehicles, #total-vehicles-ta').text(totalCurrentVehicles);
            $('#total-capacity, #total-capacity-ta').text(totalOverallCapacity);

            // Render Individual Parking Cards
            lots.sort((a, b) => b.Occupancy_Percent - a.Occupancy_Percent);
            lots.forEach(lot => {
                const routeEn = lot.Route_en.toLowerCase().trim();
                let cardHtml;
                if (routeEn === 'thoothukudi') {
                    cardHtml = createParkingCard(lot, 'col-md-6');
                    $('#thoothukudi-lots-container').append(cardHtml);
                } else if (routeEn === 'tirunelveli') {
                    cardHtml = createParkingCard(lot, 'col-md-6');
                    $('#tirunelveli-lots-container').append(cardHtml);
                } else if (routeEn === 'nagercoil') {
                    cardHtml = createParkingCard(lot, 'col-12');
                    $('#nagercoil-lots-container').append(cardHtml);
                }
            });
            toggleLanguage($('#language-toggle').is(':checked'));
        });
    }

    function fetchAndRenderOverallHistoryChart() {
        $.getJSON('/api/overall-history', function(data) {
            if (overallHistoryChart) overallHistoryChart.destroy();
            overallHistoryChart = new Chart(document.getElementById('overallHistoryChart').getContext('2d'), {
                type: 'line', data: { datasets: data.datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Total Vehicle Count' } },
                        x: { type: 'time', time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h a' } } }
                    }
                }
            });
        });
    }

    function toggleLanguage(isTamil) {
        if (isTamil) { $('.lang-en').hide(); $('.lang-ta').show(); } 
        else { $('.lang-ta').hide(); $('.lang-en').show(); }
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
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, title: { display: true, text: 'Occupancy (%)' } },
                        x: { type: 'time', time: { unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: { hour: 'h:mm a' } }, title: { display: true, text: 'Time' } }
                    }
                }
            });
        }).fail(function() {
            $('#lotHistoryModalLabel').text('Error');
            $('#modal-loading-text').text('Could not load historical data. Please try again later.');
        });
    });

    $('#language-toggle').on('change', function() { toggleLanguage($(this).is(':checked')); });
    
    fetchAndRenderData();
    fetchAndRenderOverallHistoryChart();
    setInterval(fetchAndRenderData, 5 * 60 * 1000);
    setInterval(fetchAndRenderOverallHistoryChart, 5 * 60 * 1000);
});
