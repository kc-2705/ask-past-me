import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL = 'daily-journal';

const NUDGES = [
  'How was your day? Tell me in a minute.',
  'Anything worth remembering today?',
  'Quick voice note before bed?',
];

/** Turns on one daily reminder at the given time. Returns false if notifications are blocked. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<boolean> {
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily journal reminder',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Ask Past Me', body: NUDGES[Math.floor(Math.random() * NUDGES.length)] },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL,
    },
  });
  return true;
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
