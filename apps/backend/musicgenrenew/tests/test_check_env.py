from collections import namedtuple

from app import check_env


def _version_info(major, minor, micro=0):
    version_info = namedtuple("VersionInfo", "major minor micro releaselevel serial")
    return version_info(major, minor, micro, "final", 0)


def test_check_env_supported(capsys):
    code = check_env.check_python_version(version_info=_version_info(3, 11, 9))
    captured = capsys.readouterr()
    assert code == 0
    assert "OK: Python 3.11/3.12 is supported." in captured.out


def test_check_env_rejects_313(capsys):
    code = check_env.check_python_version(version_info=_version_info(3, 13, 0))
    captured = capsys.readouterr()
    assert code == 1
    assert "Python 3.13 is not supported" in captured.out
