import { Module } from "@nestjs/common";
import {
  AuthLookup,
  RolesGuard,
  SessionAuthGuard,
} from "../../common/guards/session.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: AuthLookup, useExisting: AuthService },
    SessionAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, AuthLookup, SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
