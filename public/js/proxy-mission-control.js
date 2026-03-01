(function () {
    const mapEl = document.getElementById('holo-map');
    const markersEl = document.getElementById('holo-markers');
    const linesEl = document.getElementById('holo-lines');
    const feedEl = document.getElementById('feed-list');
    const poolSelect = document.getElementById('pool-select');
    const forceBtn = document.getElementById('force-refresh');

    const statTotal = document.getElementById('stat-total');
    const statReady = document.getElementById('stat-ready');
    const statDown = document.getElementById('stat-down');
    const statCities = document.getElementById('stat-cities');
    const refreshNote = document.getElementById('refresh-note');
    const clock = document.getElementById('clock');

    const coordsByCity = {
        'new jersey': [40.0583, -74.4057],
        trenton: [40.2206, -74.7597],
        miami: [25.7617, -80.1918],
        atlanta: [33.749, -84.388],
        baltimore: [39.2904, -76.6122],
        chicago: [41.8781, -87.6298],
        denver: [39.7392, -104.9903],
        houston: [29.7604, -95.3698],
        'los angeles': [34.0522, -118.2437],
        dallas: [32.7767, -96.797],
        boise: [43.615, -116.2023],
        'rancho palos verdes': [33.7445, -118.387],
        bridgeport: [41.1792, -73.1894],
        birmingham: [33.5186, -86.8104],
        'la paz': [-16.4897, -68.1193],
        santiago: [-33.4489, -70.6693],
        'san jose': [9.9281, -84.0907],
        'buenos aires': [-34.6037, -58.3816],
        'lima district': [-12.0464, -77.0428],
        'new york': [40.7128, -74.006],
        washington: [38.9072, -77.0369],
        'coban': [15.4697, -90.3729]
    };

    const hub = { lat: 18.2208, lon: -66.5901 }; // Puerto Rico

    function tickClock() {
        clock.textContent = new Date().toLocaleString('es-PR', { hour12: false });
    }

    function toXY(lat, lon, width, height) {
        const x = ((lon + 180) / 360) * width;
        const y = ((90 - lat) / 180) * height;
        return [x, y];
    }

    function cityCoords(city) {
        const key = (city || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (coordsByCity[key]) {
            return { lat: coordsByCity[key][0], lon: coordsByCity[key][1] };
        }
        return { lat: 39, lon: -98 }; // fallback center US
    }

    function buildUrl() {
        const val = poolSelect.value;
        if (val === 'all') {
            return '/tools/proxy/status';
        }
        return `/tools/proxy/status?pools=${encodeURIComponent(val)}`;
    }

    function draw(data) {
        const pools = data.pools || [];
        const items = pools.flatMap((p) => p.items.map((item) => ({ ...item, pool: p.pool })));

        statTotal.textContent = String(data.total || 0);
        statReady.textContent = String(data.ready || 0);
        statDown.textContent = String(data.down || 0);

        const activeCities = new Set(items.filter((x) => x.ready).map((x) => x.city).filter(Boolean));
        statCities.textContent = `${activeCities.size} cities`;

        const w = mapEl.clientWidth;
        const h = mapEl.clientHeight;
        const [hubX, hubY] = toXY(hub.lat, hub.lon, w, h);

        markersEl.innerHTML = '';
        linesEl.innerHTML = '';

        const hubDot = document.createElement('div');
        hubDot.className = 'marker';
        hubDot.textContent = '🛰️';
        hubDot.style.left = `${hubX}px`;
        hubDot.style.top = `${hubY}px`;
        markersEl.appendChild(hubDot);

        const hubLabel = document.createElement('div');
        hubLabel.className = 'marker-label';
        hubLabel.textContent = 'Puerto Rico HQ';
        hubLabel.style.left = `${hubX}px`;
        hubLabel.style.top = `${hubY}px`;
        markersEl.appendChild(hubLabel);

        for (const item of items) {
            const c = cityCoords(item.city);
            const [x, y] = toXY(c.lat, c.lon, w, h);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String((hubX / w) * 1000));
            line.setAttribute('y1', String((hubY / h) * 460));
            line.setAttribute('x2', String((x / w) * 1000));
            line.setAttribute('y2', String((y / h) * 460));
            line.setAttribute('stroke', item.ready ? 'rgba(38,255,159,0.48)' : 'rgba(255,91,108,0.52)');
            line.setAttribute('stroke-width', item.ready ? '1.3' : '1');
            linesEl.appendChild(line);

            const marker = document.createElement('div');
            marker.className = `marker ${item.ready ? '' : 'offline'}`;
            marker.textContent = item.ready ? '🟢' : '🔴';
            marker.style.left = `${x}px`;
            marker.style.top = `${y}px`;
            marker.title = `${item.proxyUser} | ${item.city || 'Unknown'} | ${item.vpnIp || '-'} | ${item.pool}`;
            markersEl.appendChild(marker);
        }

        const sorted = items.slice().sort((a, b) => Number(b.ready) - Number(a.ready));
        feedEl.innerHTML = sorted
            .map((item) => {
                const emoji = item.ready ? '🟢' : '🔴';
                const city = item.city || 'Unknown city';
                const ip = item.vpnIp || '-';
                return `
                    <li class="feed-item">
                        <span class="status">${emoji}</span>
                        <div>
                            <strong>${item.proxyUser}</strong>
                            <small>${city} (${item.cc || '--'}) - ${item.pool}</small>
                        </div>
                        <span class="ip">${ip}</span>
                    </li>
                `;
            })
            .join('');
    }

    async function refresh() {
        refreshNote.textContent = 'Syncing telemetry...';
        try {
            const res = await fetch(buildUrl(), { cache: 'no-store' });
            const data = await res.json();
            draw(data);
            refreshNote.textContent = `Last sync: ${new Date().toLocaleTimeString('es-PR', { hour12: false })}`;
        } catch (err) {
            refreshNote.textContent = 'Telemetry error';
        }
    }

    poolSelect.addEventListener('change', refresh);
    forceBtn.addEventListener('click', refresh);
    window.addEventListener('resize', refresh);

    tickClock();
    refresh();
    setInterval(tickClock, 1000);
    setInterval(refresh, 15000);
})();
