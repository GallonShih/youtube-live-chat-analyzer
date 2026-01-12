---
trigger: always_on
---

Entry Point: main.py is for orchestration only. It should strictly call functions from other modules.

No Logic in Main: Do not define business logic functions inside main.py.
Modularity: Always create a new file (e.g., utils.py, feature_x.py) for new functionality and import it.