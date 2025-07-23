// Enhanced App.js with Smart Connection Management and Exponential Backoff
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
    
    const connectionManager = useRef(new SmartConnectionManager());
    const pollIntervalRef = useRef(null);
    const browserCheckIntervalRef = useRef(null);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!topic.trim()) {
            setError('Please enter a topic name');
            return;
        }

        setError('');
        setIsGenerating(true);
        setJobStatus(null);
        setRetryInfo(null);
        setBrowserStatus(null);
        setConnectionHealth('stable');

        try {
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

    const handleDownload = () => {
        if (jobStatus?.pdf_url) {
            window.open(`${BACKEND_URL}${jobStatus.pdf_url}`, '_blank');
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

                                    {/* PDF Format Selection */}
                                    <div>
                                        <label htmlFor="pdfFormat" className="block text-sm font-medium text-gray-700 mb-2">
                                            Select PDF Format
                                        </label>
                                        <select
                                            id="pdfFormat"
                                            value={pdfFormat}
                                            onChange={(e) => setPdfFormat(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
                                        >
                                            <option value="text">Text Form (PDF with text)</option>
                                            <option value="image">Image Form (High-Quality Screenshots of MCQs)</option>
                                        </select>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                            <p className="text-red-800 text-sm">{error}</p>
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

                    {/* Results */}
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
                                    className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    📄 Download PDF
                                </button>
                                <button
                                    onClick={resetForm}
                                    className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    🔄 Extract Another Topic
                                </button>
                            </div>
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
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
