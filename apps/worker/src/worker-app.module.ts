import { Module } from "@nestjs/common";
import { AuthModule } from "@advo/backend";

/** Headless worker context; domain handlers are plain functions invoked by BullMQ consumers. */
@Module({
  imports: [AuthModule],
})
export class WorkerAppModule {}
