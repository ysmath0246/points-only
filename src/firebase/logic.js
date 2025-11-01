// src/firebase/logic.js
import Holidays from 'date-holidays';
/**
 * findNextScheduledDate
 * @param {string} lastDateStr - "YYYY-MM-DD" 형식의 마지막 수업일
 * @param {Array<string>} scheduledDays - 예: ["월", "수"]
 * @returns {string} 다음 수업일 ("YYYY-MM-DD")
 */
// 요일 매핑 & 다음 수업일 계산
export function findNextScheduledDate(lastDateStr, scheduledDays) {
  const dayMapping = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  let date = new Date(lastDateStr);
  while (true) {
    date.setDate(date.getDate() + 1);
    const dayName = Object.keys(dayMapping).find(k => dayMapping[k] === date.getDay());
    if (scheduledDays.includes(dayName)) break;
  }
  const yyyy = date.getFullYear();
  let mm = date.getMonth() + 1;
  let dd = date.getDate();
  if (mm < 10) mm = '0' + mm;
  if (dd < 10) dd = '0' + dd;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * generateScheduleWithRollovers
 * @param {string} startDate  // 첫 수업일
 * @param {Array<string>} days  // 주당 수업 요일 ["월","수"...]
 * @param {number} count       // 총 회차 (예: 8,12)
 * @param {Array<string>} holidays // 제외할 휴일
 * @returns {{session:number,date:string}[]}
 */

// 주어진 시작일로부터 count회차 수업 일정을 생성, 공휴일/사용자휴일 제외
export function generateScheduleWithRollovers(startDate, days, count, holidays = []) {
  const lessons = [];
  let date = new Date(startDate);

   // 요일 매핑 객체
   const dayMap = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

   while (lessons.length < count) {
     const dateStr = date.toISOString().split('T')[0];
     // 올바른 dayName 계산
     const dayName = dayMap[date.getDay()];
 
     if (days.includes(dayName) && !holidays.includes(dateStr)) {
       lessons.push({
         date: dateStr,
         session: lessons.length + 1
       });
     }
     date.setDate(date.getDate() + 1);
   }
   return lessons;
 }
 
 // (기존) publicHolidaysKR 부분은 그대로 유지
 export const publicHolidaysKR = new Holidays('KR')
   .getHolidays(new Date().getFullYear())
   .map(h => h.date);

