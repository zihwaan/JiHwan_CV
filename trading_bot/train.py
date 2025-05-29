"""
Main training and backtesting script for the DRL Trading Bot.
"""
import numpy as np
import pandas as pd

from agent.dqn_agent import DQNAgent
from environment.trading_env import TradingEnv
from data_handler.data_loader import load_csv_data # normalize_data is not used for now

# --- Configuration ---
DATA_FILE_PATH = "trading_bot/data/sample_data.csv" # Path to your data
WINDOW_SIZE = 10 # Number of previous days' prices to consider as state
INITIAL_BALANCE = 10000.0
EPISODES = 50 # Number of training episodes
BATCH_SIZE = 32 # Batch size for DQN replay
TARGET_UPDATE_FREQUENCY = 10 # How often to update the target network (in episodes)
MAX_STEPS_PER_EPISODE = 500 # Maximum steps per episode to avoid infinite loops

# --- Data Storage for API Visualization ---
training_progress_data = []
backtest_results_data = {'portfolio_history': [], 'trades': []}
bot_status = "idle" # Possible statuses: "idle", "training", "backtesting", "error"


# --- Getter Functions for API ---
def get_training_progress():
    """Returns the collected training progress data."""
    return training_progress_data

def get_backtest_results():
    """Returns the collected backtesting results."""
    return backtest_results_data

def get_bot_status():
    """Returns the current status of the bot."""
    return bot_status

# --- Main Training and Backtesting Logic ---
def run_training_and_backtesting():
    """
    Core function to run the DRL training and backtesting process.
    Updates global variables for data storage and status.
    """
    global training_progress_data, backtest_results_data, bot_status # Allow modification of global vars

    try:
        # --- 0. Reset data stores and set status ---
        training_progress_data.clear()
        backtest_results_data['portfolio_history'].clear()
        backtest_results_data['trades'].clear()
        bot_status = "training"
        print(f"Bot status: {bot_status}")

        # --- 1. Load and Prepare Data ---
        raw_df = load_csv_data(DATA_FILE_PATH)

        if raw_df.empty:
            print(f"Failed to load data from {DATA_FILE_PATH}. Setting status to error.")
            bot_status = "error"
            return

        if len(raw_df) < WINDOW_SIZE + 5:
            print(f"Not enough data in {DATA_FILE_PATH}. Need at least {WINDOW_SIZE + 5} rows. Setting status to error.")
            bot_status = "error"
            return

        env_df = raw_df[['Close']].copy()

        # --- 2. Initialize Environment and Agent ---
        env = TradingEnv(df=env_df, window_size=WINDOW_SIZE, initial_balance=INITIAL_BALANCE)
        state_size = WINDOW_SIZE
        action_size = env.action_space_n
        agent = DQNAgent(state_size=state_size, action_size=action_size, replay_buffer_size=10000)

        # --- 3. Training Loop ---
        print("Starting Training...")
        for e in range(EPISODES):
            state = env.reset()
            state = np.reshape(state, [1, state_size])
            current_episode_reward = 0

            for step in range(MAX_STEPS_PER_EPISODE):
                action = agent.act(state)
                next_state, reward, done, info = env.step(action)
                next_state = np.reshape(next_state, [1, state_size])
                agent.remember(state, action, reward, next_state, done)
                state = next_state
                current_episode_reward += reward
                if done:
                    break
            
            # Log training progress for the episode
            final_portfolio_value = env._calculate_net_worth()
            training_progress_data.append({
                'episode': e + 1,
                'final_portfolio_value': final_portfolio_value,
                'total_reward': current_episode_reward,
                'epsilon': agent.epsilon # Epsilon after decay in replay
            })
            print(f"Episode: {e+1}/{EPISODES}, Final Portfolio: {final_portfolio_value:.2f}, "
                  f"Reward: {current_episode_reward:.2f}, Epsilon: {agent.epsilon:.2f}")

            if len(agent.replay_buffer) > BATCH_SIZE:
                agent.replay(BATCH_SIZE)
            if (e + 1) % TARGET_UPDATE_FREQUENCY == 0:
                agent.update_target_model()
                print(f"Target network updated at episode {e+1}")

        # --- 4. Save Trained Model ---
        MODEL_SAVE_PATH = "trading_bot/models/"
        import os
        os.makedirs(MODEL_SAVE_PATH, exist_ok=True)
        agent.save(MODEL_SAVE_PATH + "trading_bot_dqn.weights.h5")
        print(f"Trained model saved to {MODEL_SAVE_PATH}trading_bot_dqn.weights.h5")

        bot_status = "backtesting"
        print(f"\nBot status: {bot_status}")

        # --- 5. Basic Backtesting ---
        state = env.reset()
        state = np.reshape(state, [1, state_size])
        agent.epsilon = 0.0 # Evaluation mode

        initial_backtest_balance = env.initial_balance
        backtest_results_data['portfolio_history'].append(initial_backtest_balance) # Log initial balance
        print(f"Backtesting with initial balance: {initial_backtest_balance:.2f}")

        for _ in range(len(env_df) - WINDOW_SIZE):
            action = agent.act(state)
            next_state, reward, done, info = env.step(action)
            next_state = np.reshape(next_state, [1, state_size])
            state = next_state
            backtest_results_data['portfolio_history'].append(env._calculate_net_worth())
            # TODO: Could log trades here: env.trade_history
            if done:
                break
        
        final_backtest_net_worth = env._calculate_net_worth()
        total_profit_backtest = final_backtest_net_worth - initial_backtest_balance

        print(f"\n--- Backtesting Results ---")
        print(f"Initial Portfolio Value: {initial_backtest_balance:.2f}")
        print(f"Final Portfolio Value: {final_backtest_net_worth:.2f}")
        print(f"Total Profit/Loss: {total_profit_backtest:.2f}")
        
        # Store final results (can be expanded)
        backtest_results_data['initial_balance'] = initial_backtest_balance
        backtest_results_data['final_net_worth'] = final_backtest_net_worth
        backtest_results_data['total_profit'] = total_profit_backtest
        backtest_results_data['trades_during_backtest'] = env.trade_history # Capture trades from env

        print("\nBacktesting Complete.")
        bot_status = "idle" # Set to idle after successful completion
        print(f"Bot status: {bot_status}")

    except Exception as e:
        bot_status = "error"
        print(f"An error occurred during training/backtesting: {e}")
        # Consider logging the full traceback here for debugging
        # import traceback
        # traceback.print_exc()
    finally:
        print("run_training_and_backtesting finished.")


def start_training_process():
    """
    Starts the DRL training and backtesting process.
    Manages bot status and calls the core logic.
    """
    global bot_status
    if bot_status == "training" or bot_status == "backtesting":
        print("Process is already running.")
        return {"status": "error", "message": "Training or backtesting is already in progress."}

    print("Starting new training and backtesting process via start_training_process()...")
    # For now, this is a blocking call.
    # In a Flask app, this would ideally run in a background thread/process.
    run_training_and_backtesting()

    if bot_status == "error":
        return {"status": "error", "message": "The process encountered an error."}
    else: # Should be "idle" if successful
        return {"status": "success", "message": "Training and backtesting process completed."}


# --- Script Execution ---
if __name__ == "__main__":
    # Example of how to run it:
    result = start_training_process()
    print(f"start_training_process result: {result}")

    # Example of accessing data after run (for testing purposes)
    print("\n--- Data Collected After Run ---")
    print("Training Progress Sample (last 5 episodes):", get_training_progress()[-5:])
    print("Backtest Portfolio History Sample (last 5 steps):", get_backtest_results()['portfolio_history'][-5:])
    print("Backtest Trades:", get_backtest_results().get('trades_during_backtest', []))
    print("Bot Status:", get_bot_status())

# --- End of Script ---
