// ENHANCED App.js with ANDROID ADS INTEGRATION
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css'; // Your existing custom styles

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Enhanced connection manager with exponential backoff
class SmartConnectionManager {
    constructor() {
        this.retryAttempts = 0;
        this.maxRetries = 8;
        this.baseDelay = 1000; // 1 second
        this.maxDelay = 30000; // 30 seconds
        this.browserStatusCache = null;
        this.lastBrowserCheck = 0;
        this.browserCheckInterval = 5000; // Check browser status every 5 seconds
    }

    async makeRequest(requestFn, context = '') {
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await requestFn();
                this.retryAttempts = 0; // Reset on success
                return result;
            } catch (error) {
                this.retryAttempts = attempt + 1;

                console.warn(`[Connection Manager] Attempt ${attempt + 1} failed for ${context}:`, error.message);

                // Don't retry on certain errors
                if (error.response?.status === 404) {
                    throw error;
                }

                // If we've exhausted retries, throw the error
                if (attempt === this.maxRetries) {
                    console.error(`[Connection Manager] All ${this.maxRetries + 1} attempts failed for ${context}`);
                    throw error;
                }

                // Calculate delay with exponential backoff and jitter
                const delay = Math.min(
                    this.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
                    this.maxDelay
                );

                console.log(`[Connection Manager] Retrying ${context} in ${delay}ms (attempt ${attempt + 2}/${this.maxRetries + 1})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async checkBrowserStatus() {
        const now = Date.now();

        // Use cached status if it's recent
        if (this.browserStatusCache && (now - this.lastBrowserCheck) < this.browserCheckInterval) {
            return this.browserStatusCache;
        }

        try {
            const response = await axios.get(`${BACKEND_URL}/api/browser-status`, {
                timeout: 5000
            });

            this.browserStatusCache = response.data;
            this.lastBrowserCheck = now;
            return response.data;
        } catch (error) {
            console.warn('[Connection Manager] Browser status check failed:', error.message);
            return null;
        }
    }

    getConnectionStatus() {
        return {
            retryAttempts: this.retryAttempts,
            maxRetries: this.maxRetries,
            isRetrying: this.retryAttempts > 0
        };
    }
}

// ENHANCED ADS INTEGRATION CLASS
class AndroidAdsIntegration {
    constructor() {
        this.isAndroidWebView = typeof window.AndroidBridge !== 'undefined';
        this.screenshotFeatureUnlocked = false;
        
        // Set up Android callback handlers
        if (this.isAndroidWebView) {
            this.setupAndroidCallbacks();
        }
        
        console.log('🎯 AndroidAdsIntegration initialized:', this.isAndroidWebView ? 'WebView Mode' : 'Browser Mode');
    }

    setupAndroidCallbacks() {
        // Called when screenshot feature is unlocked after watching rewarded ad
        window.onScreenshotFeatureUnlocked = () => {
            console.log('✅ Screenshot feature unlocked by Android');
            this.screenshotFeatureUnlocked = true;
            this.showNotification('Screenshot feature unlocked! You can now generate high-quality image PDFs.', 'success');
        };

        // Called when screenshot feature is used and unlock is consumed
        window.onScreenshotFeatureUsed = () => {
            console.log('📸 Screenshot feature used - unlock consumed');
            this.screenshotFeatureUnlocked = false;
            this.showNotification('Screenshot feature used. Watch another ad to use it again.', 'info');
        };

        // Called when download ad is watched and download should be allowed
        window.onDownloadAdWatched = (downloadUrl, filename) => {
            console.log('✅ Download ad watched - allowing download:', filename);
            this.showNotification('Ad watched! Your download is ready.', 'success');
            // The download will proceed automatically through the WebView
        };

        // Called when an ad error occurs
        window.onAdError = (errorMessage) => {
            console.log('❌ Ad error from Android:', errorMessage);
            this.showNotification(`Ad not available: ${errorMessage}`, 'warning');
        };
    }

    // Request screenshot feature with rewarded ad
    requestScreenshotFeature() {
        if (this.isAndroidWebView) {
            try {
                console.log('🎁 Requesting screenshot feature from Android');
                window.AndroidBridge.requestScreenshotFeature();
                return true;
            } catch (error) {
                console.error('Error requesting screenshot feature:', error);
                this.showNotification('Unable to show ad. Feature available anyway.', 'warning');
                return true; // Allow anyway
            }
        } else {
            // Browser fallback - allow feature
            console.log('🌐 Browser mode - screenshot feature available');
            return true;
        }
    }

    // Check if screenshot feature is unlocked
    checkScreenshotFeatureUnlocked() {
        if (this.isAndroidWebView) {
            try {
                const isUnlocked = window.AndroidBridge.checkScreenshotFeatureUnlocked();
                console.log('🔍 Screenshot feature status:', isUnlocked);
                return isUnlocked;
            } catch (error) {
                console.error('Error checking screenshot feature:', error);
                return true; // Allow in case of error
            }
        } else {
            // Browser fallback - always allow
            return true;
        }
    }

    // Use screenshot feature (consumes unlock)
    useScreenshotFeature() {
        if (this.isAndroidWebView) {
            try {
                window.AndroidBridge.useScreenshotFeature();
                console.log('📸 Screenshot feature used - unlock consumed');
            } catch (error) {
                console.error('Error using screenshot feature:', error);
            }
        }
    }

    // Request PDF download with interstitial ad
    requestPDFDownload(downloadUrl, filename) {
        if (this.isAndroidWebView) {
            try {
                console.log('📥 Requesting PDF download with ad:', filename);
                window.AndroidBridge.requestPDFDownload(downloadUrl, filename);
                return true; // Ad will handle the download
            } catch (error) {
                console.error('Error requesting PDF download:', error);
                this.showNotification('Unable to show ad. Starting download anyway.', 'warning');
                // Fallback to direct download
                window.open(downloadUrl, '_blank');
                return false;
            }
        } else {
            // Browser fallback - direct download
            console.log('🌐 Browser mode - direct download');
            window.open(downloadUrl, '_blank');
            return false;
        }
    }

    // Get ad system status
    getAdStatus() {
        if (this.isAndroidWebView) {
            try {
                const statusJson = window.AndroidBridge.getAdStatus();
                return JSON.parse(statusJson);
            } catch (error) {
                console.error('Error getting ad status:', error);
                return { adSystemReady: false, error: error.message };
            }
        } else {
            return { adSystemReady: false, browserMode: true };
        }
    }

    // Show notification to user
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full`;
        
        const bgColor = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        }[type] || 'bg-blue-500';
        
        notification.className += ` ${bgColor} text-white`;
        notification.innerHTML = `
            <div class="flex items-center">
                <span class="mr-2">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <span class="text-sm">${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

function App() {
    // Main app state
    const [topic, setTopic] = useState('');
    const [examType, setExamType] = useState('SSC');
    const [pdfFormat, setPdfFormat] = useState('text');
    const [isGenerating, setIsGenerating] = useState(false);
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);
    const [error, setError] = useState('');

    // Smart connection management state
    const [connectionHealth, setConnectionHealth] = useState('stable');
    const [browserStatus, setBrowserStatus] = useState(null);
    const [retryInfo, setRetryInfo] = useState(null);

    // ENHANCED ADS INTEGRATION STATE
    const [adIntegration] = useState(() => new AndroidAdsIntegration());
    const [adStatus, setAdStatus] = useState({});
    const [screenshotAdRequired, setScreenshotAdRequired] = useState(false);

    const connectionManager = useRef(new SmartConnectionManager());
    const pollIntervalRef = useRef(null);
    const browserCheckIntervalRef = useRef(null);

    // ENHANCED Check ad status on component mount
    useEffect(() => {
        const checkAdStatus = () => {
            const status = adIntegration.getAdStatus();
            setAdStatus(status);
            console.log('🎯 Current ad status:', status);
        };

        checkAdStatus();
        
        // Check ad status periodically
        const adStatusInterval = setInterval(checkAdStatus, 10000);
        
        return () => clearInterval(adStatusInterval);
    }, [adIntegration]);

    // ENHANCED Handle screenshot PDF format selection
    useEffect(() => {
        if (pdfFormat === 'image') {
            // Check if screenshot feature is available
            const isUnlocked = adIntegration.checkScreenshotFeatureUnlocked();
            setScreenshotAdRequired(!isUnlocked);
            
            if (!isUnlocked && adIntegration.isAndroidWebView) {
                console.log('🔒 Screenshot feature locked - ad required');
            }
        } else {
            setScreenshotAdRequired(false);
        }
    }, [pdfFormat, adIntegration]);

    // Enhanced job status polling with smart retry logic
    const pollJobStatus = async (jobId) => {
        try {
            const response = await connectionManager.current.makeRequest(
                () => axios.get(`${BACKEND_URL}/api/job-status/${jobId}`, {
                    timeout: 10000
                }),
                `job status for ${jobId}`
            );

            const jobData = response.data;

            setJobStatus(jobData);
            setConnectionHealth(jobData.connection_health || 'stable');
            setRetryInfo(null); // Clear retry info on success

            // Update browser status if provided
            if (jobData.browser_monitoring) {
                setBrowserStatus(jobData.browser_monitoring);
            }

            // Stop polling if job is complete or failed
            if (jobData.status === 'completed' || jobData.status === 'error') {
                setIsGenerating(false);
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                }
            }

            return jobData;

        } catch (error) {
            console.error('[Job Status] Polling failed:', error);

            const connectionStatus = connectionManager.current.getConnectionStatus();
            setRetryInfo(connectionStatus);

            // If we can't get job status, try to check browser status
            const browserStatus = await connectionManager.current.checkBrowserStatus();
            if (browserStatus) {
                setBrowserStatus(browserStatus);
                setConnectionHealth(browserStatus.connection_health);
            } else {
                setConnectionHealth('error');
            }

            // Don't show error immediately, let retry mechanism handle it
            if (connectionStatus.retryAttempts >= connectionStatus.maxRetries) {
                setError(`Failed to fetch job status after ${connectionStatus.maxRetries + 1} attempts. Browser may be restarting.`);
                setIsGenerating(false);
            }

            throw error;
        }
    };

    // Browser status monitoring
    const checkBrowserStatus = async () => {
        try {
            const status = await connectionManager.current.checkBrowserStatus();
            if (status) {
                setBrowserStatus(status);
                setConnectionHealth(status.connection_health);
            }
        } catch (error) {
            console.warn('[Browser Monitor] Status check failed:', error);
        }
    };

    // Enhanced polling effect
    useEffect(() => {
        if (!jobId || !isGenerating) return;

        // Start browser status monitoring
        browserCheckIntervalRef.current = setInterval(checkBrowserStatus, 5000);

        const startPolling = () => {
            // Clear existing polling
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }

            // Start smart polling with adaptive intervals
            pollIntervalRef.current = setInterval(async () => {
                try {
                    await pollJobStatus(jobId);
                } catch (error) {
                    // Polling will continue, errors are handled in pollJobStatus
                }
            }, 2000); // Check every 2 seconds

            // Initial poll
            pollJobStatus(jobId).catch(() => {
                // Initial poll error is handled in pollJobStatus
            });
        };

        startPolling();

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            if (browserCheckIntervalRef.current) {
                clearInterval(browserCheckIntervalRef.current);
                browserCheckIntervalRef.current = null;
            }
        };
    }, [jobId, isGenerating]);

    // ENHANCED Handle form submission with ads integration
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!topic.trim()) {
            setError('Please enter a topic name');
            return;
        }

        // ENHANCED Check if screenshot feature is selected and requires ad
        if (pdfFormat === 'image' && adIntegration.isAndroidWebView) {
            const isUnlocked = adIntegration.checkScreenshotFeatureUnlocked();
            if (!isUnlocked) {
                console.log('🎁 Screenshot feature requires rewarded ad');
                const adRequested = adIntegration.requestScreenshotFeature();
                if (adRequested) {
                    setError('Please watch the ad to unlock high-quality screenshot feature');
                    return;
                }
            }
        }

        setError('');
        setIsGenerating(true);
        setJobStatus(null);
        setRetryInfo(null);
        setBrowserStatus(null);
        setConnectionHealth('stable');

        try {
            // ENHANCED Consume screenshot unlock if using image format
            if (pdfFormat === 'image' && adIntegration.isAndroidWebView) {
                adIntegration.useScreenshotFeature();
            }

            const response = await connectionManager.current.makeRequest(
                () => axios.post(`${BACKEND_URL}/api/generate-mcq-pdf`, {
                    topic: topic.trim(),
                    exam_type: examType,
                    pdf_format: pdfFormat
                }, {
                    timeout: 30000
                }),
                'MCQ generation request'
            );

            setJobId(response.data.job_id);
            setJobStatus(response.data);

        } catch (err) {
            console.error('Error starting MCQ generation:', err);
            const errorMessage = err.response?.data?.detail || err.message || 'Failed to start MCQ generation';
            setError(errorMessage);
            setIsGenerating(false);
        }
    };

    // ENHANCED Handle download with ads integration
    const handleDownload = () => {
        if (jobStatus?.pdf_url) {
            const downloadUrl = `${BACKEND_URL}${jobStatus.pdf_url}`;
            const filename = `${examType}_${topic.replace(/\s+/g, '_')}_MCQs.pdf`;
            
            console.log('📥 Download requested:', filename);
            
            // ENHANCED Use Android ads integration for download
            const adHandled = adIntegration.requestPDFDownload(downloadUrl, filename);
            
            if (!adHandled) {
                // Fallback already handled in requestPDFDownload
                console.log('🔄 Download fallback completed');
            }
        }
    };

    // ENHANCED Handle screenshot format selection
    const handleFormatChange = (e) => {
        const newFormat = e.target.value;
        setPdfFormat(newFormat);
        
        if (newFormat === 'image') {
            console.log('📸 Image format selected - checking screenshot feature availability');
        }
    };

    const resetForm = () => {
        setTopic('');
        setExamType('SSC');
        setPdfFormat('text');
        setIsGenerating(false);
        setJobId(null);
        setJobStatus(null);
        setError('');
        setConnectionHealth('stable');
        setBrowserStatus(null);
        setRetryInfo(null);
        setScreenshotAdRequired(false);

        // Clear intervals
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        if (browserCheckIntervalRef.current) {
            clearInterval(browserCheckIntervalRef.current);
            browserCheckIntervalRef.current = null;
        }

        // Reset connection manager
        connectionManager.current = new SmartConnectionManager();
    };

    const getProgressPercentage = () => {
        if (!jobStatus || jobStatus.total_links === 0) return 0;
        return Math.round((jobStatus.processed_links / jobStatus.total_links) * 100);
    };

    const getConnectionStatusText = () => {
        if (connectionHealth === 'stable') return 'Connected';
        if (connectionHealth === 'browser_restarting') return 'Browser restarting...';
        if (connectionHealth === 'error') return 'Connection error';
        return 'Unknown status';
    };

    const getConnectionStatusColor = () => {
        switch (connectionHealth) {
            case 'stable': return 'text-green-600';
            case 'browser_restarting': return 'text-yellow-600';
            case 'error': return 'text-red-600';
            default: return 'text-gray-600';
        }
    };

    // ENHANCED Get format description with ads info
    const getFormatDescription = (format) => {
        if (format === 'text') {
            return 'Text-based PDF with clean formatting';
        } else {
            const adInfo = adIntegration.isAndroidWebView ? 
                (screenshotAdRequired ? ' (🎁 Watch ad to unlock)' : ' (✅ Unlocked)') : 
                ' (Available in browser)';
            return `High-Quality Screenshots of MCQs${adInfo}`;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-2xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-gray-900 mb-2">
                            {examType}-Focused MCQ Extractor
                        </h1>
                        <p className="text-gray-600 mb-2">
                            Extract {examType}-relevant MCQs with Smart Topic Filtering
                        </p>
                        <p className="text-sm text-blue-600 font-medium">
                            Enhanced with High-Quality Screenshots!
                        </p>
                        
                        {/* ENHANCED Ads Integration Status */}
                        {adIntegration.isAndroidWebView && (
                            <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                Android WebView Mode - Ads Integration Active
                            </div>
                        )}
                    </div>

                    {/* Connection Status Indicator */}
                    <div className="mb-4 p-3 bg-white rounded-lg shadow-sm border-l-4 border-blue-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <div className={`w-3 h-3 rounded-full mr-2 ${
                                    connectionHealth === 'stable' ? 'bg-green-500' :
                                    connectionHealth === 'browser_restarting' ? 'bg-yellow-500 animate-pulse' :
                                    'bg-red-500'
                                }`}></div>
                                <span className={`font-medium ${getConnectionStatusColor()}`}>
                                    {getConnectionStatusText()}
                                </span>
                            </div>

                            {retryInfo && retryInfo.isRetrying && (
                                <span className="text-sm text-yellow-600">
                                    Retrying... ({retryInfo.retryAttempts}/{retryInfo.maxRetries + 1})
                                </span>
                            )}

                            {browserStatus && (
                                <span className="text-xs text-gray-500">
                                    Browser restarts: {browserStatus.browser_restart_count || 0}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Main Card */}
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                            <h2 className="text-xl font-semibold text-white">Extract MCQs by Topic</h2>
                        </div>

                        <div className="p-6">
                            {!isGenerating ? (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-2">
                                            Enter Topic (e.g., "Heart", "President", "Bharatanatyam")
                                        </label>
                                        <input
                                            type="text"
                                            id="topic"
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
                                            placeholder="e.g., Heart, Physics, Mathematics"
                                            required
                                        />
                                    </div>

                                    {/* Exam Type Selection */}
                                    <div>
                                        <label htmlFor="examType" className="block text-sm font-medium text-gray-700 mb-2">
                                            Select Exam Type
                                        </label>
                                        <select
                                            id="examType"
                                            value={examType}
                                            onChange={(e) => setExamType(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
                                        >
                                            <option value="SSC">SSC</option>
                                            <option value="BPSC">BPSC</option>
                                        </select>
                                    </div>

                                    {/* ENHANCED PDF Format Selection with Ads Integration */}
                                    <div>
                                        <label htmlFor="pdfFormat" className="block text-sm font-medium text-gray-700 mb-2">
                                            Select PDF Format
                                        </label>
                                        <select
                                            id="pdfFormat"
                                            value={pdfFormat}
                                            onChange={handleFormatChange}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
                                        >
                                            <option value="text">📝 Text Form (PDF with text)</option>
                                            <option value="image">
                                                📸 Image Form ({adIntegration.isAndroidWebView ? 
                                                    (screenshotAdRequired ? '🔒 Watch Ad' : '✅ Unlocked') : 
                                                    'Available'})
                                            </option>
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {getFormatDescription(pdfFormat)}
                                        </p>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                            <p className="text-red-800 text-sm">{error}</p>
                                        </div>
                                    )}

                                    {/* ENHANCED Screenshot Ad Warning */}
                                    {pdfFormat === 'image' && screenshotAdRequired && adIntegration.isAndroidWebView && (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                            <div className="flex items-center">
                                                <span className="text-yellow-600 mr-2">🎁</span>
                                                <p className="text-yellow-800 text-sm">
                                                    High-quality screenshot feature requires watching a short ad. 
                                                    Click "Generate" to watch the ad and unlock this feature.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={connectionHealth === 'error'}
                                        className={`w-full font-medium py-3 px-4 rounded-lg transition-colors duration-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                            connectionHealth === 'error'
                                                ? 'bg-gray-400 cursor-not-allowed text-white'
                                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                    >
                                        🚀 Generate {examType} MCQ PDF ({pdfFormat === 'text' ? 'Text' : 'High-Quality Image'} Format)
                                        {pdfFormat === 'image' && screenshotAdRequired && adIntegration.isAndroidWebView && ' - Watch Ad'}
                                    </button>
                                </form>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                                        <span className="text-lg font-medium">
                                            Generating {examType} MCQ PDF ({pdfFormat === 'text' ? 'Text' : 'High-Quality Image'} Format)...
                                        </span>
                                    </div>

                                    {jobStatus && (
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-medium text-gray-600">Status:</span>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                        jobStatus.status === 'running'
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : jobStatus.status === 'completed'
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {jobStatus.status}
                                                    </span>
                                                </div>

                                                <div className="text-sm text-gray-700">
                                                    <strong>Progress:</strong> {jobStatus.progress}
                                                </div>

                                                {jobStatus.total_links > 0 && (
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-xs text-gray-600">
                                                            <span>Links processed: {jobStatus.processed_links}/{jobStatus.total_links}</span>
                                                            <span>MCQs found: {jobStatus.mcqs_found}</span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                                                style={{ width: `${getProgressPercentage()}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Connection Health Display */}
                                                {connectionHealth !== 'stable' && (
                                                    <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                                                        <div className="text-xs text-yellow-800">
                                                            <strong>Smart Connection:</strong> {
                                                                connectionHealth === 'browser_restarting'
                                                                    ? 'Browser is restarting, processing will continue automatically...'
                                                                    : 'Monitoring connection health...'
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ENHANCED Results with Ads Integration */}
                    {jobStatus && jobStatus.status === 'completed' && (
                        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-green-800 mb-2">✅ PDF Generated Successfully!</h3>
                            <p className="text-green-700 text-sm mb-2">
                                Found {jobStatus.mcqs_found} {examType} MCQs related to "{topic}"
                            </p>
                            <p className="text-green-600 text-xs mb-4">
                                Format: {pdfFormat === 'text' ? 'Text-based PDF' : 'High-Quality Image PDF'}
                            </p>
                            <div className="flex space-x-3">
                                <button
                                    onClick={handleDownload}
                                    className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center"
                                >
                                    📄 Download PDF
                                    {adIntegration.isAndroidWebView && <span className="ml-1 text-xs">(🎬 Ad)</span>}
                                </button>
                                <button
                                    onClick={resetForm}
                                    className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    🔄 Extract Another Topic
                                </button>
                            </div>
                            
                            {/* ENHANCED Download Instructions for Android */}
                            {adIntegration.isAndroidWebView && (
                                <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                                    <p className="text-xs text-blue-800">
                                        📱 <strong>Android App:</strong> Watch a short ad, then your PDF will be ready in the Downloads section!
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {jobStatus && jobStatus.status === 'error' && (
                        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-red-800 mb-2">⚠️ Error Occurred</h3>
                            <p className="text-red-700 text-sm mb-4">{jobStatus.progress}</p>
                            <button
                                onClick={resetForm}
                                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                            >
                                🔄 Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="container mx-auto px-4 pb-8 mt-6">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center shadow-md">
                        <h3 className="text-2xl font-bold text-blue-800 mb-2">🧠 Study Smarter, not Harder</h3>
                        <div className="inline-block px-4 py-2 rounded-lg shadow-sm bg-white bg-opacity-90 animated-magic-border">
                            <p className="text-base font-semibold text-gray-700 select-none">
                                Made By HEMANT SINGH
                            </p>
                        </div>
                        
                        {/* ENHANCED Ads Integration Footer */}
                        {adIntegration.isAndroidWebView && (
                            <div className="mt-2 text-xs text-blue-600">
                                🎯 Enhanced with Smart Ads Integration
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
