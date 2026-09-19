import path from "path"

process.env.KITO_DB = ":memory:"
process.env.KITO_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.KITO_DISABLE_MODELS_FETCH = "true"
