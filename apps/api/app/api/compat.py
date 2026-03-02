from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.services.compat.generation_service import (
    AssessmentAnalyzeRequest,
    AssessmentQuestionsRequest,
    CurriculumGenerateRequest,
    CurriculumRefineRequest,
    GenerateRequest,
    ReasoningRequest,
    RecommendRequest,
    SearchRequest,
    SectionsRequest,
    ValidateRequest,
    compat_assessment_analyze as service_assessment_analyze,
    compat_assessment_questions as service_assessment_questions,
    compat_auth_callback as service_auth_callback,
    compat_curriculum_generate as service_curriculum_generate,
    compat_curriculum_reasoning as service_curriculum_reasoning,
    compat_curriculum_refine as service_curriculum_refine,
    compat_curriculum_sections as service_curriculum_sections,
    compat_generate as service_generate,
    compat_recommendations as service_recommendations,
    compat_search as service_search,
    compat_validate as service_validate,
)


router = APIRouter(prefix="/api", tags=["public"])


@router.post("/generate")
def compat_generate(payload: GenerateRequest) -> dict[str, Any]:
    return service_generate(payload)


@router.post("/search")
def compat_search(payload: SearchRequest) -> dict[str, Any]:
    return service_search(payload)


@router.post("/validate")
def compat_validate(payload: ValidateRequest) -> dict[str, Any]:
    return service_validate(payload)


@router.post("/recommendations")
def compat_recommendations(payload: RecommendRequest) -> dict[str, Any]:
    return service_recommendations(payload)


@router.post("/assessment/questions")
def compat_assessment_questions(payload: AssessmentQuestionsRequest) -> dict[str, Any]:
    return service_assessment_questions(payload)


@router.post("/assessment/analyze")
def compat_assessment_analyze(payload: AssessmentAnalyzeRequest) -> dict[str, Any]:
    return service_assessment_analyze(payload)


@router.post("/curriculum/generate")
def compat_curriculum_generate(payload: CurriculumGenerateRequest) -> dict[str, Any]:
    return service_curriculum_generate(payload)


@router.post("/curriculum/refine")
def compat_curriculum_refine(payload: CurriculumRefineRequest) -> dict[str, Any]:
    return service_curriculum_refine(payload)


@router.post("/curriculum/reasoning")
def compat_curriculum_reasoning(payload: ReasoningRequest) -> dict[str, Any]:
    return service_curriculum_reasoning(payload)


@router.post("/curriculum/sections")
def compat_curriculum_sections(payload: SectionsRequest) -> dict[str, Any]:
    return service_curriculum_sections(payload)


@router.get("/auth/callback")
def compat_auth_callback(request: Request, code: str | None = None, next: str = "/dashboard") -> RedirectResponse:
    return service_auth_callback(request=request, code=code, next=next)
