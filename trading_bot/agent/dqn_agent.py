"""
Deep Q-Network (DQN) agent for the trading bot.
"""
import numpy as np
import random
from collections import deque
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense
from tensorflow.keras.optimizers import Adam

class DQNAgent:
    """
    A Deep Q-Network agent that learns to trade stocks.
    """
    def __init__(self, state_size: int, action_size: int,
                 learning_rate: float = 0.001, gamma: float = 0.95,
                 epsilon: float = 1.0, epsilon_decay: float = 0.995,
                 epsilon_min: float = 0.01, replay_buffer_size: int = 10000):
        """
        Initializes the DQN agent.

        Args:
            state_size: Dimensionality of the state space.
            action_size: Number of possible actions.
            learning_rate: Learning rate for the optimizer.
            gamma: Discount factor for future rewards.
            epsilon: Initial exploration rate for epsilon-greedy policy.
            epsilon_decay: Rate at which epsilon decays.
            epsilon_min: Minimum value for epsilon.
            replay_buffer_size: Maximum size of the experience replay buffer.
        """
        self.state_size = state_size
        self.action_size = action_size
        self.replay_buffer = deque(maxlen=replay_buffer_size)
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_decay = epsilon_decay
        self.epsilon_min = epsilon_min
        self.learning_rate = learning_rate

        # Main model (gets trained)
        self.model = self._build_model()
        # Target model (used for predicting target Q values)
        self.target_model = self._build_model()
        self.update_target_model() # Initialize target model weights

    def _build_model(self):
        """
        Builds the Q-Network model.

        Returns:
            A compiled Keras model.
        """
        # Simple feedforward neural network
        model = Sequential()
        model.add(Dense(24, input_shape=(self.state_size,), activation='relu'))
        model.add(Dense(24, activation='relu')) # Additional hidden layer
        model.add(Dense(self.action_size, activation='linear')) # Output Q-values for each action
        model.compile(loss='mse', optimizer=Adam(learning_rate=self.learning_rate))
        return model

    # Methods update_target_model, remember, act, replay, load, save will be added next.

    def update_target_model(self):
        """
        Copies weights from the main model to the target model.
        """
        self.target_model.set_weights(self.model.get_weights())

    def remember(self, state, action, reward, next_state, done):
        """
        Stores an experience tuple in the replay buffer.

        Args:
            state: The current state.
            action: The action taken.
            reward: The reward received.
            next_state: The next state.
            done: Whether the episode has ended.
        """
        self.replay_buffer.append((state, action, reward, next_state, done))

    def act(self, state: np.ndarray) -> int:
        """
        Selects an action using an epsilon-greedy policy.

        Args:
            state: The current state.

        Returns:
            The action to take.
        """
        # Ensure state is in the correct shape for the model, e.g., (1, state_size)
        if state.ndim == 1:
            state = np.reshape(state, [1, self.state_size])

        if np.random.rand() <= self.epsilon:
            return random.randrange(self.action_size) # Explore: random action
        else:
            act_values = self.model.predict(state, verbose=0) # Exploit: best action from Q-network
            return np.argmax(act_values[0])

    def replay(self, batch_size: int):
        """
        Trains the main Q-network using experiences from the replay buffer.

        Args:
            batch_size: The number of experiences to sample from the buffer for training.
        """
        if len(self.replay_buffer) < batch_size:
            return # Not enough experiences to replay

        minibatch = random.sample(self.replay_buffer, batch_size)

        for state, action, reward, next_state, done in minibatch:
            # Ensure state and next_state are correctly shaped for the model
            if state.ndim == 1:
                state = np.reshape(state, [1, self.state_size])
            if next_state.ndim == 1:
                next_state = np.reshape(next_state, [1, self.state_size])

            target = reward
            if not done:
                # Predict future discounted reward from target model
                target = reward + self.gamma * np.amax(self.target_model.predict(next_state, verbose=0)[0])

            # Get current Q-values from main model
            current_q_values = self.model.predict(state, verbose=0)
            # Update Q-value for the action taken
            current_q_values[0][action] = target

            # Train the main model
            self.model.fit(state, current_q_values, epochs=1, verbose=0)

        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def load(self, name: str):
        """
        Loads weights into the main Q-network from a file.

        Args:
            name: The file path to load the weights from.
        """
        try:
            self.model.load_weights(name)
            self.update_target_model() # Also update target model to match
            print(f"Model weights loaded successfully from {name}")
        except Exception as e:
            print(f"Error loading model weights from {name}: {e}")


    def save(self, name: str):
        """
        Saves the weights of the main Q-network to a file.

        Args:
            name: The file path to save the weights to.
        """
        try:
            self.model.save_weights(name)
            print(f"Model weights saved successfully to {name}")
        except Exception as e:
            print(f"Error saving model weights to {name}: {e}")
