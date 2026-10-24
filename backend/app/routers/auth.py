from fastapi import APIRouter,Depends,HTTPException,status
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.schemas import AuthRequest,TokenResponse,UserResponse
from app.security import hash_password,verify_password,create_access_token,get_current_user
router=APIRouter(prefix="/api/auth",tags=["authentication"])
@router.post("/register",response_model=UserResponse,status_code=status.HTTP_201_CREATED)
def register(payload:AuthRequest,db:Session=Depends(get_db)):
    email=payload.email.lower().strip()
    if db.query(User).filter(User.email==email).first(): raise HTTPException(409,"An account with this email already exists.")
    user=User(email=email,password_hash=hash_password(payload.password));db.add(user);db.commit();db.refresh(user)
    return UserResponse(id=user.id,email=user.email)
@router.post("/login",response_model=TokenResponse)
def login(payload:AuthRequest,db:Session=Depends(get_db)):
    user=db.query(User).filter(User.email==payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password,user.password_hash): raise HTTPException(401,"Incorrect email or password.")
    return TokenResponse(access_token=create_access_token(user.id))
@router.get("/me",response_model=UserResponse)
def me(user:User=Depends(get_current_user)): return UserResponse(id=user.id,email=user.email)
