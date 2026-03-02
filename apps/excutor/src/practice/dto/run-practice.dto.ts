import { IsString, MinLength } from 'class-validator';

export class PracticeRunRequestDto {
  @IsString()
  problem_id: string;

  @IsString()
  @MinLength(1)
  code: string;
}

export class PracticeRunResponseDto {
  passed: boolean;
  stdout: string;
  stderr: string;
}
