/**
 * pushService.ts
 * Utility to send push notifications to Expo applications.
 */

export const sendPushNotificationToDriver = async (
  pushToken: string | null | undefined, 
  title: string, 
  body: string, 
  data: any = {}
) => {
  if (!pushToken || !pushToken.includes('ExponentPushToken[')) {
      // Invalid or non-existent push token
      return;
  }
  
  try {
    const message = {
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high'
    };

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};
