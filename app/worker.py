from app import create_app


def main():
    app = create_app({"JOB_RUNNER_MODE": "worker"})
    app.extensions["job_manager"].run_forever()


if __name__ == "__main__":
    main()
