"""
Custom trading environment for the DRL agent.
"""
import numpy as np
import pandas as pd
# It's good practice to import gym if you are aiming for gym compatibility,
# even if not strictly inheriting from gym.Env initially.
# import gymnasium as gym # Or import gym if you are using the older version

class TradingEnv: # If you want to make it a gym.Env, you'd do: class TradingEnv(gym.Env):
    """
    A custom trading environment that simulates stock trading.

    The environment allows an agent to take actions (Buy, Sell, Hold) based on
    historical price data.
    """
    def __init__(self, df: pd.DataFrame, window_size: int, initial_balance: float):
        """
        Initializes the trading environment.

        Args:
            df: Pandas DataFrame with historical price data. Must include a 'Close' column.
            window_size: The number of past time steps to consider as the state.
            initial_balance: The starting cash balance for the simulation.
        """
        if 'Close' not in df.columns:
            raise ValueError("DataFrame must contain a 'Close' column.")
        if not isinstance(df, pd.DataFrame):
            raise ValueError("df must be a pandas DataFrame.")
        if window_size <= 0:
            raise ValueError("window_size must be a positive integer.")
        if initial_balance <= 0:
            raise ValueError("initial_balance must be a positive float.")

        self.df = df
        self.window_size = window_size
        self.initial_balance = initial_balance

        # Internal state
        self.current_step = 0
        self.balance = self.initial_balance
        self.shares_held = 0
        self.net_worth_history = [] # To track portfolio value over time
        self.trade_history = [] # To record buy/sell actions

        # Define action space (simplified)
        # 0: Hold, 1: Buy, 2: Sell
        self.action_space_n = 3

        # The observation space will be a window of closing prices.
        # We'll define its shape more concretely in reset() or when needed.
        # For gym compatibility, you would define self.observation_space and self.action_space here.
        # Example:
        # self.action_space = spaces.Discrete(3)
        # self.observation_space = spaces.Box(low=0, high=np.inf, shape=(window_size,), dtype=np.float32)

    def _get_current_price(self) -> float:
        """Returns the closing price at the current step."""
        return self.df['Close'].iloc[self.current_step]

    def _get_state(self) -> np.ndarray:
        """
        Returns the current state (observation) for the agent.
        The state is a window of the previous `window_size` closing prices.
        """
        if self.current_step < self.window_size -1:
            # Not enough data for a full window, pad with the earliest price
            padding = [self.df['Close'].iloc[0]] * (self.window_size - (self.current_step + 1))
            state_window = padding + self.df['Close'].iloc[:self.current_step + 1].tolist()
        else:
            state_window = self.df['Close'].iloc[self.current_step - self.window_size + 1 : self.current_step + 1]
        return np.array(state_window, dtype=np.float32)

    # Methods reset, step, and render will be added in subsequent steps.
    # For now, let's ensure the __init__ and helper methods are well-defined.

    def _calculate_net_worth(self) -> float:
        """Calculates the current total net worth (balance + value of shares held)."""
        return self.balance + (self.shares_held * self._get_current_price())

    def reset(self) -> np.ndarray:
        """
        Resets the environment to the initial state.

        Returns:
            The initial observation (state).
        """
        self.current_step = 0 # Start from the beginning of the data
        self.balance = self.initial_balance
        self.shares_held = 0
        self.net_worth_history = [self.initial_balance] # Start with initial balance
        self.trade_history = []

        # The first valid state is at window_size - 1, but we allow starting from step 0
        # and _get_state handles padding for earlier steps.
        # However, to provide a full window for the first state, let's set current_step
        # such that the first call to _get_state() returns a meaningful window.
        # For consistency, if we always want a full window, we can set:
        # self.current_step = self.window_size -1 # This ensures the first state is a full window
        # But this also means we skip the first few data points for trading.
        # Let's stick to current_step = 0 and let _get_state handle it.
        # The agent will learn to deal with padded states if necessary.

        return self._get_state()

    def step(self, action: int) -> tuple[np.ndarray, float, bool, dict]:
        """
        Executes one time step within the environment.

        Args:
            action: An integer representing the action to take (0: Hold, 1: Buy, 2: Sell).

        Returns:
            A tuple containing:
                - next_state (np.ndarray): The state after taking the action.
                - reward (float): The reward obtained from the action.
                - done (bool): Whether the episode has ended.
                - info (dict): Additional information (empty for now).
        """
        if not (0 <= action < self.action_space_n):
            raise ValueError(f"Invalid action {action}. Action must be 0, 1, or 2.")

        current_price = self._get_current_price()
        previous_net_worth = self._calculate_net_worth()

        # Execute action
        if action == 1: # Buy
            if self.balance > 0: # Can only buy if there's balance
                # Simple strategy: buy as many shares as possible with current balance
                shares_to_buy = self.balance / current_price
                self.shares_held += shares_to_buy
                self.balance = 0
                self.trade_history.append({'step': self.current_step, 'type': 'BUY', 'price': current_price, 'shares': shares_to_buy})
        elif action == 2: # Sell
            if self.shares_held > 0: # Can only sell if shares are held
                self.balance += self.shares_held * current_price
                shares_sold = self.shares_held
                self.shares_held = 0
                self.trade_history.append({'step': self.current_step, 'type': 'SELL', 'price': current_price, 'shares': shares_sold})
        # Action 0 (Hold) requires no change in balance or shares_held

        # Update step and net worth
        self.current_step += 1
        current_net_worth = self._calculate_net_worth()
        self.net_worth_history.append(current_net_worth)

        # Calculate reward
        reward = current_net_worth - previous_net_worth

        # Check if done
        # Episode ends if we run out of data or (optionally) if net worth drops to zero
        done = self.current_step >= len(self.df) -1 # -1 because current_step is 0-indexed

        # Get next state
        next_state = self._get_state() if not done else np.zeros(self.window_size, dtype=np.float32)

        return next_state, reward, done, {}

    def render(self, mode: str = 'human') -> None:
        """
        Renders the environment (e.g., prints current status).

        Args:
            mode: The mode to render with (e.g., 'human', 'rgb_array').
                  Currently, only 'human' mode is supported, printing to console.
        """
        if mode == 'human':
            current_price = self._get_current_price() if self.current_step < len(self.df) else self.df['Close'].iloc[-1]
            net_worth = self._calculate_net_worth()
            print(f"Step: {self.current_step}/{len(self.df)}")
            print(f"Current Price: {current_price:.2f}")
            print(f"Balance: {self.balance:.2f}")
            print(f"Shares Held: {self.shares_held:.2f}")
            print(f"Net Worth: {net_worth:.2f}")
            if self.trade_history:
                last_trade = self.trade_history[-1]
                print(f"Last Trade: {last_trade['type']} @ {last_trade['price']:.2f} for {last_trade['shares']:.2f} shares")
            print("-" * 30)
        elif mode == 'rgb_array':
            # Placeholder for rendering to an RGB array (e.g., for video recording)
            # This would require a more complex visualization setup (e.g., using matplotlib)
            print("Warning: 'rgb_array' mode is not implemented. Use 'human' mode.")
            pass
        else:
            super().render(mode=mode) # If inheriting from gym.Env and it has a render method

    def close(self) -> None:
        """
        Performs any necessary cleanup.
        """
        # In this simple environment, there might not be much to clean up.
        # If using external resources like files or network connections, close them here.
        print("Trading environment closed.")
