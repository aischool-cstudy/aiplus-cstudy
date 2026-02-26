/**
 * 알고리즘 기반 일정 배분 — AI 호출 없이 토픽을 일별로 균등 배분
 */

interface TopicInput {
  title: string;
  estimated_minutes: number;
}

interface ScheduleItem {
  topic_index: number;
  day_number: number;
  order_in_day: number;
}

export interface AlgorithmScheduleResult {
  schedule: ScheduleItem[];
  totalDays: number;
  dailyBreakdown: {
    day: number;
    topics: string[];
    estimated_minutes: number;
  }[];
}

/**
 * 하루 학습 시간(분)을 기준으로 토픽을 일별로 배분
 * - 토픽 순서 유지
 * - 하루 목표 시간 + 여유치(고정+비율)를 기준으로 같은 날 묶음
 * - 최소 1개 토픽은 반드시 하루에 배정
 */
export function calculateSchedule(
  topics: TopicInput[],
  dailyMinutes: number
): AlgorithmScheduleResult {
  const schedule: ScheduleItem[] = [];
  const dailyBreakdown: AlgorithmScheduleResult['dailyBreakdown'] = [];

  let currentDay = 1;
  let currentDayMinutes = 0;
  let orderInDay = 1;
  let currentDayTopics: string[] = [];

  const safeDailyMinutes = Math.max(30, Math.round(dailyMinutes || 60));
  // 하루 학습시간 반영을 더 명확히 하기 위해 여유치를 고정 폭 + 비율로 계산
  const overflow = Math.min(30, Math.max(15, Math.round(safeDailyMinutes * 0.35)));
  const threshold = safeDailyMinutes + overflow;

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];

    // 현재 날에 이미 토픽이 있고, 추가하면 임계값을 넘는 경우 → 다음 날로
    const topicMinutes = Math.max(35, Math.min(90, Math.round(topic.estimated_minutes || 50)));
    if (currentDayMinutes > 0 && currentDayMinutes + topicMinutes > threshold) {
      // 현재 날 마무리
      dailyBreakdown.push({
        day: currentDay,
        topics: [...currentDayTopics],
        estimated_minutes: currentDayMinutes,
      });

      currentDay++;
      currentDayMinutes = 0;
      orderInDay = 1;
      currentDayTopics = [];
    }

    schedule.push({
      topic_index: i,
      day_number: currentDay,
      order_in_day: orderInDay,
    });

    currentDayMinutes += topicMinutes;
    currentDayTopics.push(topic.title);
    orderInDay++;
  }

  // 마지막 날 마무리
  if (currentDayTopics.length > 0) {
    dailyBreakdown.push({
      day: currentDay,
      topics: currentDayTopics,
      estimated_minutes: currentDayMinutes,
    });
  }

  return {
    schedule,
    totalDays: currentDay,
    dailyBreakdown,
  };
}
