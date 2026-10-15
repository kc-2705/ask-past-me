import type { SQLiteDatabase } from 'expo-sqlite';
import { addEntry, knownTagLabels } from '@/db/database';
import { detectMood, extractTags } from './tagger';

// [days ago, hour, text]. Written like real spoken notes so search and Ask have something to work with.
const SAMPLES: [number, number, string][] = [
  [365, 21, 'First snow of the year. Bought my first proper winter jacket at Target. Called Amma and showed her the snow on video. Happy and a little homesick.'],
  [88, 20, 'Went to the gym after work for the first time in weeks. Legs are already sore. Need to buy new running shoes.'],
  [80, 22, 'Long day at work. Too much work and a deadline on Friday. Feeling stressed. Ordered pizza and watched a movie with Priya.'],
  [74, 19, 'Got a haircut at Great Clips. It came out a bit too short this time. Then groceries at Costco.'],
  [70, 21, 'Called Amma for an hour. We laughed about old school stories. Felt better after that.'],
  [66, 18, 'Dentist appointment in the morning. No cavities. Need to book an eye checkup soon.'],
  [61, 20, 'Team lunch with Ravi and Meera at Chipotle. Ravi suggested a Thai restaurant called Thai Basil. Should try it this weekend.'],
  [58, 17, 'Tried Thai Basil with Priya. The green curry was amazing. Great day.'],
  [53, 22, 'Stressed about the release. Could not sleep well. Too much coffee in the evening.'],
  [52, 21, 'Walked by the river after the release. Head felt clear again. Calm evening.'],
  [47, 20, 'Yoga class at the community center. Relaxed and slept well.'],
  [43, 19, 'Laundry, cleaning and cooking dal for the week. Boring but productive.'],
  [40, 21, 'Interview prep with Meera. Practiced system design questions. Nervous about next week.'],
  [36, 18, 'Had the interview. I think it went well. Proud of how I explained my project.'],
  [33, 20, 'Called Appa about the visa documents. Need to renew my driving license next month.'],
  [29, 21, 'Deadline week again. Overwhelmed. Skipped the gym.'],
  [28, 20, 'Skipped evening coffee and actually slept by eleven. Felt much better in the morning.'],
  [25, 19, 'Gym again, finally. Thirty minutes on the treadmill. Proud of myself.'],
  [21, 22, 'Movie night with Priya and Ravi. We watched a comedy and laughed a lot.'],
  [17, 21, 'Called Amma, laughed for an hour. Forgot about the deadline for a while. Grateful for her.'],
  [14, 20, 'Went to the temple in the evening. Peaceful. Lit a lamp for Nani.'],
  [12, 19, 'Doctor appointment for the headache. Nothing serious, just need more water and sleep.'],
  [9, 21, 'Finished the dashboard demo draft. Manager liked the charts. Excited for the presentation.'],
  [7, 18, 'Hike at the state park with Meera. Beautiful leaves. Tired but happy.'],
  [5, 20, 'Groceries at Patel Brothers. Bought mangoes and coriander. Cooked biryani.'],
  [3, 22, 'Couldn’t focus today. Worried about the visa timeline. Talked to Priya and felt calmer.'],
  [2, 19, 'Gym in the morning, then a long meeting. Need to pay the rent tomorrow.'],
  [1, 21, 'Paid the rent. Watched a movie alone. Calm and okay.'],
  [0, 20, 'Long day at work. Finished the dashboard demo and the team liked it. Got a haircut at Great Clips on the way home. Called Amma at nine.'],
];

export const SAMPLE_COUNT = SAMPLES.length;

export async function loadSampleEntries(db: SQLiteDatabase) {
  const now = new Date();
  await db.withTransactionAsync(async () => {
    for (const [ago, hour, text] of SAMPLES) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago, hour, Math.floor(Math.random() * 50));
      const known = {
        people: await knownTagLabels(db, 'person'),
        places: await knownTagLabels(db, 'place'),
      };
      await addEntry(db, {
        text,
        mood: detectMood(text),
        tags: extractTags(text, known),
        audio: [],
        durationMs: 0,
        createdAt: Math.min(d.getTime(), Date.now()),
      });
    }
  });
}
