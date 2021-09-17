from fastapi import BackgroundTasks, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .models import (
    DownloadModelTask,
    LanguageDoesNotExist,
    ModelDoesNotExist,
    ModelNotDownloaded,
    models,
)
from .tasks import TaskNotFoundError, tasks
from .transcribe import TranscriptionState, TranscriptionTask, process_audio

app = FastAPI()
origins = [
    "http://localhost:3000",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/tasks/start_transcription/")
async def start_transcription(
    background_tasks: BackgroundTasks,
    lang: str,
    model: str,
    file: UploadFile = File(...),
):
    task = tasks.add(TranscriptionTask(file.filename, TranscriptionState.QUEUED))
    background_tasks.add_task(process_audio, lang, model, file.file, task.uuid)
    return task


@app.post("/tasks/download_model/")
async def download_model(
    background_tasks: BackgroundTasks,
    lang: str,
    model: str,
):
    task = tasks.add(DownloadModelTask(lang, model))
    background_tasks.add_task(models.download, lang, model, task.uuid)
    return task


# FIXME: this needs to be removed / put behind proper auth for security reasons
@app.get("/tasks/list/")
async def list_tasks():
    return sorted(tasks.list(), key=lambda x: x.uuid)


@app.get("/tasks/{task_uuid}/")
async def get_task(task_uuid: str):
    return tasks.get(task_uuid)


@app.get("/models/available")
async def get_all_models():
    return models.available


@app.get("/models/downloaded")
async def get_downloaded_models():
    return models.downloaded


@app.exception_handler(TaskNotFoundError)
async def task_not_found_error_handler(request, exc):
    return PlainTextResponse(str(exc), status_code=404)


@app.exception_handler(LanguageDoesNotExist)
async def language_does_not_exist_handler(request, exc):
    return PlainTextResponse(str(exc), status_code=404)


@app.exception_handler(ModelDoesNotExist)
async def model_does_not_exist_handler(request, exc):
    return PlainTextResponse(str(exc), status_code=404)


@app.exception_handler(ModelNotDownloaded)
async def model_not_downloaded_handler(request, exc):
    return PlainTextResponse(str(exc), status_code=412)
