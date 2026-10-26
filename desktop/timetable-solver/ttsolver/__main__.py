"""`python -m ttsolver` opens the app; `python -m ttsolver solve|check …` runs the command line."""
import sys


def run() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in ("solve", "check", "-h", "--help"):
        from .cli import main
        return main()
    from .gui import main
    return main()


if __name__ == "__main__":
    sys.exit(run())
