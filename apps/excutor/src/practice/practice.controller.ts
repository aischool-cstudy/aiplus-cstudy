import { Controller, Post, Body } from '@nestjs/common';
import { PracticeService } from './practice.service';
import { PracticeRunRequestDto, PracticeRunResponseDto } from './dto/run-practice.dto';

@Controller('v1/practice')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('run')
  run(@Body() dto: PracticeRunRequestDto): Promise<PracticeRunResponseDto> {
    return this.practiceService.run(dto);
  }
}
