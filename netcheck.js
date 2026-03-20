/**
 * Network Speed Test with Optional API Integrations
 * - Speed measurement: No API key needed (uses CDN endpoints)
 * - Location info: Optional ipinfo.io key (free tier: 50k/month)
 * - Results history: Optional backend endpoint
 */

class NetworkSpeedTest {
    constructor() {
        // Configuration
        this.config = {
            duration: 10000,
            warmupDuration: 2000,
            parallelConnections: 4,
            sampleInterval: 200,
            latencySamples: 5,
            // Multiple CDN endpoints for redundancy (no API keys needed)
            endpoints: [
                'https://speed.cloudflare.com/__down?bytes=25000000',
                'https://speed.cloudflare.com/__down?bytes=50000000',
                'https://speed.cloudflare.com/__down?bytes=10000000',
                'https://fast.com/api/speedtest?download=25000000', // Netflix/Fast endpoint pattern
                'https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js?r=', // Fallback small file
                'https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js?r=' // Google CDN fallback
            ],
            // OPTIONAL: Add your API keys here
            apis: {
                // Get free key at ipinfo.io (50k requests/month free)
                ipinfo: 'bd34047a40d350', 
             
                // Your custom backend to save results (optional)
                resultsEndpoint: null // e.g., 'https://your-api.com/speed-results'
            }
        };
        
        this.state = {
            isRunning: false,
            startTime: 0,
            samples: [],
            loadedLatencySamples: [],
            abortControllers: [],
            bytesDownloaded: 0,
            lastSampleTime: 0,
            lastSampleBytes: 0,
            clientInfo: null
        };
    }

    now() {
        return performance.now();
    }

    getEndpoint() {
        // Rotate through endpoints to avoid cache
        const base = this.config.endpoints[Math.floor(Math.random() * this.config.endpoints.length)];
        return `${base}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // ENHANCED: Get real client info using APIs
    async getClientInfo() {
        const clientInfoEl = document.getElementById('clientInfo');
        if (!clientInfoEl) return;

        try {
            let locationData = null;
            let ip = 'Unknown';

            // Try ipinfo.io first (most accurate, free tier available)
            if (this.config.apis.ipinfo && this.config.apis.ipinfo !== 'YOUR_IPINFO_TOKEN_HERE') {
                try {
                    const res = await fetch(`https://ipinfo.io/json?token=${this.config.apis.ipinfo}`);
                    if (res.ok) {
                        locationData = await res.json();
                        ip = locationData.ip;
                    }
                } catch (e) {
                    console.log('ipinfo failed, trying fallback...');
                }
            }

            // Fallback to ipgeolocation.io
            if (!locationData && this.config.apis.ipgeolocation && this.config.apis.ipgeolocation !== 'YOUR_IPGEOLOCATION_KEY_HERE') {
                try {
                    const res = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${this.config.apis.ipgeolocation}`);
                    if (res.ok) {
                        const data = await res.json();
                        locationData = {
                            city: data.city,
                            region: data.state_prov,
                            country: data.country_code2,
                            org: data.isp,
                            ip: data.ip
                        };
                        ip = data.ip;
                    }
                } catch (e) {
                    console.log('ipgeolocation failed...');
                }
            }

            // Free fallback: ipapi.co (45 requests/minute free, no key needed)
            if (!locationData) {
                try {
                    const res = await fetch('https://ipapi.co/json/');
                    if (res.ok) {
                        const data = await res.json();
                        locationData = {
                            city: data.city,
                            region: data.region,
                            country: data.country,
                            org: data.org,
                            ip: data.ip
                        };
                        ip = data.ip;
                    }
                } catch (e) {
                    console.log('ipapi failed...');
                }
            }

            // Update state and UI
            this.state.clientInfo = locationData || { ip };
            
            let locationStr = 'Unknown Location';
            if (locationData) {
                const city = locationData.city || 'Unknown';
                const region = locationData.region || locationData.state || '';
                const country = locationData.country || 'Unknown';
                locationStr = `${city}, ${region ? region + ', ' : ''}${country}`;
            }

            clientInfoEl.innerHTML = `
                <span class="font-semibold">Client:</span> ${locationStr} 
                <span class="text-xs text-gray-500 ml-2">${ip}</span>
                ${locationData?.org ? `<br><span class="text-xs text-gray-400">${locationData.org}</span>` : ''}
            `;

        } catch (error) {
            clientInfoEl.innerHTML = '<span class="text-gray-400">Location unavailable</span>';
        }
    }

    // ENHANCED: Save results to your backend (optional)
    async saveResults(speed, unloadedLatency, loadedLatency) {
        if (!this.config.apis.resultsEndpoint) return;

        try {
            const payload = {
                timestamp: new Date().toISOString(),
                downloadSpeed: speed,
                unloadedLatency: unloadedLatency,
                loadedLatency: loadedLatency,
                clientInfo: this.state.clientInfo,
                userAgent: navigator.userAgent,
                connectionType: navigator.connection?.effectiveType || 'unknown'
            };

            await fetch(this.config.apis.resultsEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                // Fire and forget - don't block UI
                keepalive: true
            });
        } catch (e) {
            console.log('Failed to save results:', e);
        }
    }

    async measureUnloadedLatency() {
        const samples = [];
        // Use Cloudflare or Google for latency (reliable, global)
        const endpoints = [
            'https://www.google.com/favicon.ico',
            'https://cloudflare.com/favicon.ico',
            'https://apple.com/favicon.ico'
        ];
        
        for (let i = 0; i < this.config.latencySamples; i++) {
            const endpoint = endpoints[i % endpoints.length];
            const start = this.now();
            try {
                await fetch(`${endpoint}?r=${Date.now()}`, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store'
                });
                const latency = this.now() - start;
                if (latency < 1000) samples.push(latency); // Filter timeouts
            } catch (e) {
                samples.push(0);
            }
            await new Promise(r => setTimeout(r, 300));
        }
        
        samples.sort((a, b) => a - b);
        const valid = samples.filter(s => s > 0);
        // Use median for latency (more stable than average)
        return valid.length ? Math.round(valid[Math.floor(valid.length / 2)]) : 0;
    }

    async measureLoadedLatency() {
        const start = this.now();
        try {
            await fetch(`https://www.google.com/favicon.ico?r=${Date.now()}`, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            });
            return this.now() - start;
        } catch (e) {
            return 0;
        }
    }

    async downloadWorker(controller) {
        const xhr = new XMLHttpRequest();
        const startTime = this.now();
        let lastLoaded = 0;
        let lastTime = startTime;
        
        return new Promise((resolve, reject) => {
            xhr.onprogress = (event) => {
                const now = this.now();
                const loaded = event.loaded;
                
                if (now - this.state.lastSampleTime >= this.config.sampleInterval) {
                    const bytesDiff = loaded - lastLoaded;
                    const timeDiff = now - lastTime;
                    
                    if (timeDiff > 0) {
                        const bps = (bytesDiff * 8) / (timeDiff / 1000);
                        const mbps = bps / 1000000;
                        
                        if (now - startTime > 500) {
                            this.state.samples.push({
                                time: now - this.state.startTime,
                                mbps: mbps,
                                bytes: loaded
                            });
                        }
                    }
                    
                    lastLoaded = loaded;
                    lastTime = now;
                    this.state.lastSampleTime = now;
                }
                
                this.state.bytesDownloaded = loaded;
                
                if (controller.signal.aborted) {
                    xhr.abort();
                    resolve();
                }
            };
            
            xhr.onload = () => resolve();
            xhr.onerror = () => reject(new Error('Download failed'));
            xhr.onabort = () => resolve();
            
            xhr.open('GET', this.getEndpoint(), true);
            xhr.send();
            
            controller.signal.addEventListener('abort', () => xhr.abort());
        });
    }

    calculateResults() {
        if (this.state.samples.length < 3) return 0;
        
        this.state.samples.sort((a, b) => a.time - b.time);
        
        // Discard TCP ramp-up (first 20%)
        const discardCount = Math.floor(this.state.samples.length * 0.2);
        const validSamples = this.state.samples.slice(discardCount);
        
        // Discard top 10% outliers
        validSamples.sort((a, b) => a.mbps - b.mbps);
        const outlierDiscard = Math.floor(validSamples.length * 0.1);
        const finalSamples = validSamples.slice(0, validSamples.length - outlierDiscard);
        
        if (finalSamples.length === 0) return 0;
        
        // Calculate sustained throughput
        const avgMbps = finalSamples.reduce((sum, s) => sum + s.mbps, 0) / finalSamples.length;
        
        return Math.max(0.1, avgMbps);
    }

    updateUI(speed, unloadedLatency, loadedLatency) {
        const mainSpeedEl = document.getElementById('mainSpeed');
        const speedValueEl = document.getElementById('speedValue');
        const unloadedEl = document.getElementById('unloadedLatency');
        const loadedEl = document.getElementById('loadedLatency');
        
        if (mainSpeedEl) {
            // Animate the number
            this.animateNumber(mainSpeedEl, parseFloat(mainSpeedEl.textContent) || 0, speed, 1000);
        }
        
        if (speedValueEl) {
            speedValueEl.textContent = speed.toFixed(1) + ' Mbps';
        }
        
        if (unloadedEl) {
            unloadedEl.textContent = unloadedLatency + 'ms';
        }
        
        if (loadedEl) {
            const loadedVal = loadedLatency || unloadedLatency;
            loadedEl.textContent = loadedVal + 'ms';
            // Color code based on bufferbloat
            if (loadedVal > unloadedLatency * 2) {
                loadedEl.classList.remove('text-yellow-600', 'text-green-600');
                loadedEl.classList.add('text-red-600');
            }
        }
    }

    animateNumber(element, start, end, duration) {
        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = start + (end - start) * easeOutQuart;
            
            element.textContent = current.toFixed(1);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };
        
        requestAnimationFrame(update);
    }

    setLoading(show, message = '') {
        const overlay = document.getElementById('loadingOverlay');
        const msgEl = document.getElementById('loadingMessage');
        
        if (overlay) {
            if (show) {
                overlay.classList.remove('hidden');
                overlay.classList.add('flex');
            } else {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex');
            }
        }
        
        if (msgEl && message) {
            msgEl.textContent = message;
        }
    }

    async start() {
        if (this.state.isRunning) return;
        this.state.isRunning = true;
        
        // Reset
        this.state.samples = [];
        this.state.loadedLatencySamples = [];
        this.state.bytesDownloaded = 0;
        this.state.startTime = this.now();
        this.state.lastSampleTime = this.now();
        this.state.abortControllers = [];
        
        this.setLoading(true, 'Detecting location...');
        
        // Get location first (uses API if configured)
        await this.getClientInfo();
        
        this.setLoading(true, 'Measuring unloaded latency...');
        
        try {
            const unloadedLatency = await this.measureUnloadedLatency();
            
            this.setLoading(true, 'Running speed test...');
            
            // Start parallel downloads
            const workers = [];
            for (let i = 0; i < this.config.parallelConnections; i++) {
                const controller = new AbortController();
                this.state.abortControllers.push(controller);
                workers.push(this.downloadWorker(controller));
            }
            
            // Sample loaded latency
            const latencyInterval = setInterval(async () => {
                if (!this.state.isRunning) {
                    clearInterval(latencyInterval);
                    return;
                }
                const lat = await this.measureLoadedLatency();
                if (lat > 0) this.state.loadedLatencySamples.push(lat);
            }, 2000);
            
            // Progress bar animation
            const progressInterval = setInterval(() => {
                if (!this.state.isRunning) {
                    clearInterval(progressInterval);
                    return;
                }
                const elapsed = this.now() - this.state.startTime;
                const progress = Math.min((elapsed / this.config.duration) * 100, 100);
                const progressBar = document.querySelector('#loadingOverlay .bg-blue-500');
                if (progressBar) progressBar.style.width = progress + '%';
            }, 100);
            
            // Wait for test duration
            await new Promise(r => setTimeout(r, this.config.duration));
            
            clearInterval(latencyInterval);
            clearInterval(progressInterval);
            this.state.abortControllers.forEach(c => c.abort());
            
            await Promise.allSettled(workers);
            
            const finalSpeed = this.calculateResults();
            const avgLoadedLatency = this.state.loadedLatencySamples.length > 0 
                ? Math.round(this.state.loadedLatencySamples.reduce((a,b) => a+b, 0) / this.state.loadedLatencySamples.length)
                : unloadedLatency;
            
            this.updateUI(finalSpeed, unloadedLatency, avgLoadedLatency);
            
            // Save to backend if configured
            await this.saveResults(finalSpeed, unloadedLatency, avgLoadedLatency);
            
        } catch (error) {
            console.error('Speed test error:', error);
            this.updateUI(0, 0, 0);
        } finally {
            this.state.isRunning = false;
            this.setLoading(false);
        }
    }
}

// Initialize
const speedTest = new NetworkSpeedTest();

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => speedTest.start(), 500);
    
    const rerunBtn = document.getElementById('rerunButton');
    if (rerunBtn) {
        rerunBtn.addEventListener('click', () => speedTest.start());
    }
});