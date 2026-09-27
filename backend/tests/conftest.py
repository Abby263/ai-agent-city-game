"""Keep backend tests offline and independent of credentials and saved worlds."""

import socket

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.config import Settings


def pytest_configure(config):
    patch = pytest.MonkeyPatch()
    config._offline_patch = patch
    patch.setattr(
        Settings,
        "settings_customise_sources",
        classmethod(lambda cls, settings_cls, init_settings, **sources: (init_settings,)),
    )
    from app import config as app_config

    test_settings = Settings(database_fallback_url="sqlite+pysqlite:///:memory:")
    patch.setattr(app_config, "get_settings", lambda: test_settings)

    def deny_network(*args, **kwargs):
        raise AssertionError("Backend tests must not make network connections")

    patch.setattr(socket.socket, "connect", deny_network)
    patch.setattr(socket.socket, "connect_ex", deny_network)
    from app import database

    database.engine.dispose()
    test_engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    patch.setattr(database, "engine", test_engine)
    database.SessionLocal.configure(bind=test_engine)
    config._test_engine = test_engine


def pytest_unconfigure(config):
    if hasattr(config, "_test_engine"):
        config._test_engine.dispose()
    if hasattr(config, "_offline_patch"):
        config._offline_patch.undo()
