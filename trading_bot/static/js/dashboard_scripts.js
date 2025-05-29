// Chart.js instances
let trainingPortfolioChartInstance;
let rewardChartInstance;
let epsilonChartInstance;
let backtestPortfolioChartInstance;

const API_BASE_URL = 'http://localhost:5000'; // Assuming Flask runs on port 5000

// DOM Elements
const botStatusDisplay = document.getElementById('botStatusDisplay');
const startTrainingBtn = document.getElementById('startTrainingBtn');
const totalProfitDisplay = document.getElementById('totalProfit');
const tradeCountDisplay = document.getElementById('tradeCount');
const initialBalanceDisplay = document.getElementById('initialBalanceDisplay');
const finalNetWorthDisplay = document.getElementById('finalNetWorthDisplay');

// --- Chart Initialization ---
function initCharts() {
    const ctxTrainingPortfolio = document.getElementById('trainingPortfolioChart').getContext('2d');
    trainingPortfolioChartInstance = new Chart(ctxTrainingPortfolio, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Portfolio Value', data: [], borderColor: 'rgb(75, 192, 192)', tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxReward = document.getElementById('rewardChart').getContext('2d');
    rewardChartInstance = new Chart(ctxReward, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Total Reward', data: [], borderColor: 'rgb(255, 99, 132)', tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxEpsilon = document.getElementById('epsilonChart').getContext('2d');
    epsilonChartInstance = new Chart(ctxEpsilon, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Epsilon', data: [], borderColor: 'rgb(54, 162, 235)', tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxBacktestPortfolio = document.getElementById('backtestPortfolioChart').getContext('2d');
    backtestPortfolioChartInstance = new Chart(ctxBacktestPortfolio, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Portfolio Value', data: [], borderColor: 'rgb(153, 102, 255)', tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- API Fetch Functions ---
async function fetchBotStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        botStatusDisplay.textContent = `Status: ${data.status}`;
    } catch (error) {
        console.error('Error fetching bot status:', error);
        botStatusDisplay.textContent = 'Status: Error fetching status';
    }
}

async function fetchTrainingProgress() {
    try {
        const response = await fetch(`${API_BASE_URL}/training-progress`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const progress = data.progress || [];

        const episodes = progress.map(p => p.episode);
        const portfolioValues = progress.map(p => p.final_portfolio_value);
        const rewards = progress.map(p => p.total_reward);
        const epsilons = progress.map(p => p.epsilon);

        updateChart(trainingPortfolioChartInstance, episodes, portfolioValues);
        updateChart(rewardChartInstance, episodes, rewards);
        updateChart(epsilonChartInstance, episodes, epsilons);

    } catch (error) {
        console.error('Error fetching training progress:', error);
    }
}

async function fetchBacktestResults() {
    try {
        const response = await fetch(`${API_BASE_URL}/backtest-results`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const results = data.results || {};
        
        const portfolioHistory = results.portfolio_history || [];
        updateChart(backtestPortfolioChartInstance, Array.from(Array(portfolioHistory.length).keys()), portfolioHistory);

        totalProfitDisplay.textContent = results.total_profit !== undefined ? results.total_profit.toFixed(2) : '-';
        tradeCountDisplay.textContent = results.trades_during_backtest ? results.trades_during_backtest.length : '-';
        initialBalanceDisplay.textContent = results.initial_balance !== undefined ? results.initial_balance.toFixed(2) : '-';
        finalNetWorthDisplay.textContent = results.final_net_worth !== undefined ? results.final_net_worth.toFixed(2) : '-';

    } catch (error) {
        console.error('Error fetching backtest results:', error);
    }
}

// --- Action Functions ---
async function startTraining() {
    botStatusDisplay.textContent = 'Status: Starting training...';
    try {
        const response = await fetch(`${API_BASE_URL}/start-training`, { method: 'POST' });
        const data = await response.json();
        
        botStatusDisplay.textContent = `Status: ${data.message}`;
        // Optionally, start polling for status or refresh data after a delay
        if (response.ok && data.status === "success") {
            // Training started, fetch status and progress periodically
            // For simplicity, we'll just fetch once after a short delay here.
            // A more robust solution would use setInterval and clearInterval.
            setTimeout(() => {
                fetchBotStatus();
                fetchTrainingProgress(); // To see if any initial progress is made or if it's already running
            }, 3000);
        } else {
             fetchBotStatus(); // Refresh status if it failed to start or was already running
        }
    } catch (error) {
        console.error('Error starting training:', error);
        botStatusDisplay.textContent = 'Status: Error starting training.';
    }
}

// --- Helper Functions ---
function updateChart(chart, labels, data) {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

// --- Event Listeners ---
if (startTrainingBtn) {
    startTrainingBtn.addEventListener('click', startTraining);
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchBotStatus();
    fetchTrainingProgress();
    fetchBacktestResults();

    // Optional: Periodically update data
    // setInterval(fetchBotStatus, 5000); // Every 5 seconds
    // setInterval(fetchTrainingProgress, 30000); // Every 30 seconds (if training is long)
    // Note: Frequent polling of backtest results might not be necessary unless it can change without retraining.
});
