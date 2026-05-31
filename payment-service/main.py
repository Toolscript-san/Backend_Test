# Servicio de procesamiento de pagos simulado

import random

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Servicio de Procesamiento de Pagos", version="1.0.0")


class PaymentRequest(BaseModel):
    """Solicitud de procesamiento de pago."""
    amount: float = Field(..., gt=0, description="Monto del pago a procesar")


class PaymentResponse(BaseModel):
    """Respuesta del procesamiento de pago."""
    approved: bool
    message: str
    amount: float
    authorization_code: str | None = None


@app.post("/process-payment", response_model=PaymentResponse)
def process_payment(payment: PaymentRequest):
    """Procesa un pago y lo aprueba o rechaza aleatoriamente (80% aprobado, 20% rechazado)."""
    approved = random.random() < 0.8

    if approved:
        code = f"AUTH-{random.randint(100000, 999999)}"
        return PaymentResponse(
            approved=True,
            message="Pago aprobado",
            amount=payment.amount,
            authorization_code=code,
        )

    return PaymentResponse(
        approved=False,
        message="Pago rechazado por el procesador",
        amount=payment.amount,
    )


@app.get("/health")
def health():
    """Verificación de salud del servicio."""
    return {"status": "ok"}
