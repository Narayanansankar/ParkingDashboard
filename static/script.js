$(document).ready(function() {
    let singleLotChart;
    let overallHistoryChart;
    const darkTextColor = '#333333';

    function createParkingCard(lot, columnClass) {
        const occupancyPercent = lot.Occupancy_Percent;
        let progressBarColor = 'bg-success';
        if (occupancyPercent > 85) progressBarColor = 'bg-danger';
        else if (occupancyPercent > 50) progressBarColor = 'bg-warning';

        const statusText = lot.IsParkingAvailable ? 'Available' : 'Closed';
        const statusClass = lot.IsParkingAvailable ? 'status-available' : 'status-unavailable';
        const statusPill = `<span class="availability-pill ${statusClass}">${statusText}</span>`;

        let progressSection = '';
        if (lot.TotalCapacity > 0) {
            let progressWrapper = `<div class="progress-wrapper mt-2">`;
            if (occupancyPercent > 0) {
                progressWrapper += `<span class="progress-percent-badge">${Math.round(occupancyPercent)}%</span>`;
            }
            progressWrapper += `
                <div class="progress" role="progressbar" aria-valuenow="${occupancyPercent}" aria-valuemin="0" aria-valuemax="100" style="height: 20px;">
                    <div class="progress-bar ${progressBarColor}" style="width: ${occupancyPercent}%;"></div>
                </div>
            `;
            progressWrapper += `</div>`;
            progressSection = progressWrapper;
        }

        return `
            <div class="${columnClass}">
                <div class="card parking-card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <h5 class="parking-name mb-0 me-2">${lot.Parking_name_en}</h5>
                            ${statusPill}
                        </div>
                        <p class="text-muted my-2">Occupancy: ${lot.Current_Vehicle} / ${lot.TotalCapacity}</p>
                        ${progressSection}
                    </div>
                </div>
            </div>
        `;
    }

    function fetchAndRenderData() {
        $.getJSON('/api/parking-data', function(response) {
            const lots = response.route_lots; 
            const specialLots = response.special_lots;

            $('#thoothukudi-col-1, #thoothukudi-col-2, #tirunelveli-col-1, #tirunelveli-col-2, #nagercoil-lots-container, #two-wheeler-details').empty();
            
            const lastUpdated = new Date(response.last_updated);
            $('#last-updated').text(lastUpdated.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
            
            // CORRECTED: Calculate totals here in the JavaScript
            let totalCurrentVehicles = 0;
            let totalOverallCapacity = 0;
            const routeStats = {'Thoothukudi': { current: 0, total: 0 },'Tirunelveli': { current: 0, total: 0 },'Nagercoil': { current: 0, total: 0 }};
            
            if (lots && Array.isArray(lots)) {
                lots.forEach(lot => {
                    // This calculation is now done for the main progress bar
                    totalCurrentVehicles += lot.Current_Vehicle;
                    totalOverallCapacity += lot.TotalCapacity;

                    if (routeStats[lot.Route_en]) {
                        routeStats[lot.Route_en].current += lot.Current_Vehicle;
                        routeStats[lot.Route_en].total += lot.TotalCapacity;
                    }
                });
            }

            // Update the main "Total Parking" progress bar
            const overallOccupancyPercent = totalOverallCapacity > 0 ? (totalCurrentVehicles / totalOverallCapacity) * 100 : 0;
            let overallProgressBarColor = 'bg-success';
            if (overallOccupancyPercent > 85) overallProgressBarColor = 'bg-danger'; else if (overallOccupancyPercent > 50) overallProgressBarColor = 'bg-warning';
            const $progressBar = $('#overall-progress-bar');
            $progressBar.css('width', overallOccupancyPercent + '%').attr('aria-valuenow', overallOccupancyPercent).text(Math.round(overallOccupancyPercent) + '%').removeClass('bg-success bg-warning bg-danger').addClass(overallProgressBarColor);
            $('#total-vehicles').text(totalCurrentVehicles.toLocaleString());
            $('#total-capacity').text(totalOverallCapacity.toLocaleString());

            // Update the individual route progress bars
            for (const routeName in routeStats) {
                const percent = routeStats[routeName].total > 0 ? (routeStats[routeName].current / routeStats[routeName].total) * 100 : 0;
                let barColor = 'bg-success';
                if (percent > 85) barColor = 'bg-danger'; else if (percent > 50) barColor = 'bg-warning';
                const routeId = routeName.toLowerCase();
                $(`#${routeId}-route-progress`).css('width', percent + '%').text(Math.round(percent) + '%').removeClass('bg-success bg-warning bg-danger').addClass(barColor);
                $(`#${routeId}-route-count`).text(`${routeStats[routeName].current} / ${routeStats[routeName].total}`);
            }

            // Render the parking lot cards
            if (lots && Array.isArray(lots)) {
                lots.sort((a, b) => b.Occupancy_Percent - a.Occupancy_Percent);
                let thoothukudiIndex = 0;
                let tirunelveliIndex = 0;
                lots.forEach(lot => {
                    const routeEn = lot.Route_en.toLowerCase().trim();
                    const cardHtml = createParkingCard(lot, 'col-12 mb-3');
                    if (routeEn === 'thoothukudi') {
                        if (thoothukudiIndex % 2 === 0) { $('#thoothukudi-col-1').append(cardHtml); } else { $('#thoothukudi-col-2').append(cardHtml); }
                        thoothukudiIndex++;
                    } else if (routeEn === 'tirunelveli') {
                        if (tirunelveliIndex % 2 === 0) { $('#tirunelveli-col-1').append(cardHtml); } else { $('#tirunelveli-col-2').append(cardHtml); }
                        tirunelveliIndex++;
                    } else if (routeEn === 'nagercoil') {
                        $('#nagercoil-lots-container').append(createParkingCard(lot, 'col-12'));
                    }
                });
            }

            // Render the two-wheeler details
            if (specialLots && specialLots.two_wheeler) {
                const twoWheelerData = specialLots.two_wheeler;
                const twoWheelerHtml = `
                    <p class="text-muted mb-1">${twoWheelerData.Parking_name_en}</p>
                    <h4 class="fw-bold">
                        ${twoWheelerData.Current_Vehicle.toLocaleString()} / ${twoWheelerData.TotalCapacity.toLocaleString()}
                    </h4>
                `;
                $('#two-wheeler-details').html(twoWheelerHtml);
            } else {
                 $('#two-wheeler-details').html('<p class="text-muted">Data not available</p>');
            }
        });
    }
    
    // (The chart functions remain unchanged)
    function fetchAndRenderOverallHistoryChart() {$.getJSON('/api/overall-history', function(data) {const ctx = document.getElementById('overallHistoryChart').getContext('2d'); if (overallHistoryChart) { overallHistoryChart.destroy(); } overallHistoryChart = new Chart(ctx, {type: 'line', data: { datasets: data.datasets }, options: {responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: {tooltip: { position: 'nearest' }, legend: {labels: {color: darkTextColor, font: { weight: 'bold' }}}}, scales: {y: {beginAtZero: true, title: {display: true, text: 'Total Vehicle Count', color: darkTextColor, font: { weight: 'bold' }}, ticks: {color: darkTextColor}, grid: {color: 'rgba(0, 0, 0, 0.1)'}}, x: {type: 'time', time: {unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: {hour: 'h a'}}, ticks: {color: darkTextColor}, grid: {color: 'rgba(0, 0, 0, 0.1)'}}}}});});}
    $('#lotHistoryModal').on('show.bs.modal', function(event) {const button = event.relatedTarget; const parkingLotID = button.getAttribute('data-parking-id'); $('#modal-loading-text').show(); $('#singleLotChart').hide(); if (singleLotChart) { singleLotChart.destroy(); } $.getJSON(`/api/parking-lot-history?id=${parkingLotID}`, function(data) {$('#lotHistoryModalLabel').text(`Last 24-Hour History for ${data.lotName}`); $('#modal-loading-text').hide(); $('#singleLotChart').show(); const ctx = document.getElementById('singleLotChart').getContext('2d'); singleLotChart = new Chart(ctx, {type: 'line', data: { datasets: data.datasets }, options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {labels: {color: darkTextColor, font: { weight: 'bold' }}}}, scales: {y: {beginAtZero: true, max: 100, title: {display: true, text: 'Occupancy (%)', color: darkTextColor, font: { weight: 'bold' }}, ticks: {color: darkTextColor}, grid: {color: 'rgba(0, 0, 0, 0.1)'}}, x: {type: 'time', time: {unit: 'hour', tooltipFormat: 'MMM d, h:mm a', displayFormats: {hour: 'h:mm a'}}, title: {display: true, text: 'Time', color: darkTextColor, font: { weight: 'bold' }}, ticks: {color: darkTextColor}, grid: {color: 'rgba(0, 0, 0, 0.1)'}}}}});}).fail(function() {$('#lotHistoryModalLabel').text('Error'); $('#modal-loading-text').text('Could not load historical data.');});});
    fetchAndRenderData();
    fetchAndRenderOverallHistoryChart();
    setInterval(fetchAndRenderData, 5 * 60 * 1000);
    setInterval(fetchAndRenderOverallHistoryChart, 5 * 60 * 1000);
});
