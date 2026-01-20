from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import AsyncGenerator, Dict, Optional


@dataclass
class JobState:
    job_id: str
    total: int
    queue: asyncio.Queue[Optional[str]] = field(default_factory=asyncio.Queue)
    success: int = 0
    failed: int = 0


class JobManager:
    def __init__(self) -> None:
        self._jobs: Dict[str, JobState] = {}

    def create_job(self, total: int) -> JobState:
        job_id = uuid.uuid4().hex
        state = JobState(job_id=job_id, total=total)
        self._jobs[job_id] = state
        return state

    def get_job(self, job_id: str) -> Optional[JobState]:
        return self._jobs.get(job_id)

    def remove_job(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)

    def publish_event(self, job_id: str, event: str, data: dict) -> None:
        state = self._jobs.get(job_id)
        if not state:
            return
        payload = json.dumps(data, ensure_ascii=True)
        message = f"event: {event}\ndata: {payload}\n\n"
        state.queue.put_nowait(message)

    def close_job(self, job_id: str) -> None:
        state = self._jobs.get(job_id)
        if not state:
            return
        state.queue.put_nowait(None)

    async def stream(self, job_id: str) -> AsyncGenerator[str, None]:
        state = self._jobs.get(job_id)
        if not state:
            return
        while True:
            message = await state.queue.get()
            if message is None:
                break
            yield message
        self.remove_job(job_id)


job_manager = JobManager()
