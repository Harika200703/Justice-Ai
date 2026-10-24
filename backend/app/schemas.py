from pydantic import BaseModel, EmailStr, Field
class AuthRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
class UserResponse(BaseModel):
    id: int
    email: EmailStr
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
