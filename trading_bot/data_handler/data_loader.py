"""
Data loading and preprocessing utilities for the DRL trading bot.
"""
import pandas as pd

def load_csv_data(file_path: str) -> pd.DataFrame:
    """
    Loads trading data from a CSV file.

    Args:
        file_path: Path to the CSV file.
                   Assumes CSV has columns like 'Date', 'Open', 'High', 'Low', 'Close', 'Volume'.

    Returns:
        A pandas DataFrame with the loaded data.
    """
    try:
        df = pd.read_csv(file_path)
    except FileNotFoundError:
        # Handle the case where the file doesn't exist
        print(f"Error: File not found at {file_path}")
        return pd.DataFrame() # Return empty DataFrame
    except Exception as e:
        # Handle other potential errors during CSV reading
        print(f"Error loading CSV data: {e}")
        return pd.DataFrame() # Return empty DataFrame
    return df

def normalize_data(dataframe: pd.DataFrame, columns_to_normalize: list[str]) -> pd.DataFrame:
    """
    Normalizes specified columns in a DataFrame using Min-Max scaling.

    Args:
        dataframe: The pandas DataFrame to normalize.
        columns_to_normalize: A list of column names to be normalized.

    Returns:
        The DataFrame with the specified columns normalized.
    """
    df_copy = dataframe.copy()
    for col in columns_to_normalize:
        if col in df_copy.columns:
            min_val = df_copy[col].min()
            max_val = df_copy[col].max()
            if max_val - min_val > 0:  # Avoid division by zero if all values are the same
                df_copy[col] = (df_copy[col] - min_val) / (max_val - min_val)
            else:
                df_copy[col] = 0 # Or handle as appropriate (e.g., all values become 0.5 or remain unchanged)
        else:
            print(f"Warning: Column '{col}' not found in DataFrame. Skipping normalization for this column.")
    return df_copy

def split_data(dataframe: pd.DataFrame, train_ratio: float = 0.8) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Splits the DataFrame into training and testing sets.

    Args:
        dataframe: The pandas DataFrame to split.
        train_ratio: The proportion of the data to use for training (e.g., 0.8 for 80%).

    Returns:
        A tuple containing two DataFrames: (train_df, test_df).
    """
    if not (0 < train_ratio < 1):
        raise ValueError("train_ratio must be between 0 and 1 (exclusive).")

    split_index = int(len(dataframe) * train_ratio)
    train_df = dataframe.iloc[:split_index]
    test_df = dataframe.iloc[split_index:]
    return train_df, test_df
