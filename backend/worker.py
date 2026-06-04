import threading
import time
import serial
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SerialWorker:
    def __init__(self, port, baudrate, data_callback, error_callback=None):
        self.port = port
        self.baudrate = baudrate
        self.data_callback = data_callback
        self.error_callback = error_callback
        
        self.is_running = False
        self.serial_conn = None
        self.thread = None
        self.use_mock = False

    def start(self):
        self.is_running = True
        try:
            self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
            logger.info(f"Connected to {self.port} at {self.baudrate} baud.")
        except Exception as e:
            msg = f"Failed to connect to {self.port}: {e}. Falling back to mock data."
            logger.warning(msg)
            if self.error_callback:
                self.error_callback(msg)
            self.use_mock = True

        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        mock_val = 50.0
        while self.is_running:
            if not self.use_mock and self.serial_conn and self.serial_conn.is_open:
                try:
                    if self.serial_conn.in_waiting > 0:
                        line = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                        if line.startswith("Distance:"):
                            try:
                                dist_str = line.split(":")[1].strip()
                                distance = float(dist_str)
                                self.data_callback(distance)
                            except ValueError:
                                pass
                except Exception as e:
                    logger.error(f"Serial read error: {e}")
                    self.use_mock = True
            else:
                # Mock data generation
                mock_val += random.uniform(-2.0, 2.0)
                mock_val = max(0.0, min(mock_val, 400.0))
                self.data_callback(mock_val)
                time.sleep(1) # Simulate 1Hz data rate

    def stop(self):
        self.is_running = False
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
        if self.thread:
            self.thread.join(timeout=2)
