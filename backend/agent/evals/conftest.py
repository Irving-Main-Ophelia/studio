"""Eval harness conftest — fixtures shared across all eval suites."""
from pathlib import Path
import pytest

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def bach_xml():
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


@pytest.fixture()
def andante_xml():
    return (FIXTURES / "andante-c-sharp-minor.musicxml").read_text()
