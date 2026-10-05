import { Module } from "@nestjs/common";
import { BackendCoreModule } from "@advo/backend";

@Module({
  imports: [BackendCoreModule],
})
export class HttpAppModule {}
