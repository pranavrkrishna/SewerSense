import os

DEFAULT_COM_PORT = os.getenv("COM_PORT", "COM3")
DEFAULT_BAUD_RATE = int(os.getenv("BAUD_RATE", "9600"))
MOCK_DATA_ON_FAIL = True  # Automatically use mock data if connection fails
