import { Module } from '@nestjs/common';
import { PracticeModule } from './practice/practice.module';

@Module({
  imports: [PracticeModule],
})
export class AppModule {}
