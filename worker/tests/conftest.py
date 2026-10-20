"""Unit tests never open or mutate the operator's actual worker job store."""
import atexit
import os
import tempfile
import sys

_test_data = tempfile.TemporaryDirectory(prefix="tikytoky-unit-data-")
os.environ["WORKER_DATA_DIR"] = _test_data.name
def _cleanup():
    module = sys.modules.get("tikytoky.server")
    if module is not None:
        module.store.db.close()
    _test_data.cleanup()

atexit.register(_cleanup)
