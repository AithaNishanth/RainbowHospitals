import {Platform, Alert, PermissionsAndroid, Linking} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {PERMISSIONS, request} from 'react-native-permissions';

import Toast from 'react-native-toast-message';

import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import {
  getMessaging,
  requestPermission,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  setBackgroundMessageHandler,
  AuthorizationStatus,
  registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging';
import {navigate} from '../navigation/navigation';
import {filterAppointment} from './common-functions';

export const requestLocationPermission = async () => {
  const permission = Platform.select({
    ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    android: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  });

  if (!permission) {
    throw new Error('Location permission is not available for this platform.');
  }

  const result = await request(permission);
  return result;
};

export const getCurrentCoordinates = async (): Promise<{
  latitude: number;
  longitude: number;
} | null> => {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) return null;

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        const {latitude, longitude} = position.coords;
        resolve({latitude, longitude});
      },
      error => {
        console.error('Location Error:', error.message);
        reject(null);
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
    );
  });
};

export const getCityNameFromCoords = async (
  latitude: number,
  longitude: number,
): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
    );
    const data = await response.json();
    const address = data.address;

    // Combine relevant address components
    const suburb =
      address.suburb || address.neighbourhood || address.village || '';
    const city = address.city || address.town || address.state_district || '';
    const state = address.state || '';

    // You can adjust this format as per your display needs
    const fullLocation = suburb || city || state.filter(Boolean).join(', ');

    return fullLocation || 'Unknown';
  } catch (error: any) {
    ToastService.error(
      'Error',
      error?.response?.data?.message ||
        error?.message ||
        'Something went wrong',
    );
    return null;
  }
};

type ToastType = 'success' | 'error' | 'info';

const showToast = (
  type: ToastType,
  title: string,
  message?: string,
  position: 'top' | 'bottom' = 'top',
) => {
  Toast.show({
    type,
    position,
    text1: title,
    text2: message,
    visibilityTime: 3000,
    autoHide: true,
    topOffset: 50,
    bottomOffset: 50,
  });
};

export const ToastService = {
  success: (title: string, message?: string) =>
    showToast('success', title, message),
  error: (title: string, message?: string) =>
    showToast('error', title, message),
  info: (title: string, message?: string) => showToast('info', title, message),
};

// ✅ Request notification permissions & get FCM token
export const requestUserPermission = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    console.log('permission', hasPermission);
    
    if (!hasPermission) {
      const status = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );

      if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        Alert.alert(
          'Permission Required',
          'Notification permission is required.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ],
        );
      }
    }
  }

  const messaging = await getMessaging();

  const authStatus = await requestPermission(messaging);
  const enabled =
  authStatus === AuthorizationStatus.AUTHORIZED ||
  authStatus === AuthorizationStatus.PROVISIONAL;
  if (enabled) {
    // await registerDeviceForRemoteMessages(messaging)
    const token = await getToken(messaging);
    console.log('called',token);
  }
};

export const setupNotificationListeners = () => {
  const messaging = getMessaging();
  onNotificationOpenedApp(messaging, async remoteMessage => {
    await handleNotificationPress(remoteMessage);
    // if (remoteMessage?.notification?.android?.channelId == 'default') {
    //   const parsedData = JSON.parse(remoteMessage?.data?.appointment);
    //   const data = await filterAppointment(
    //     parsedData?.mrn,
    //     parsedData?.his_booking_id,
    //   );
    //   navigate('MyAppointmentDetails', {
    //     appointmentData: {...data, join: false},
    //   });
    // } else {
    //   const parsedData = JSON.parse(remoteMessage?.data?.appointment);
    //   const data = await filterAppointment(
    //     parsedData?.mrn,
    //     parsedData?.his_booking_id,
    //   );
    //   navigate('MyAppointmentDetails', {
    //     appointmentData: {...data, join: true},
    //   });
    // }
  });
  getInitialNotification(messaging).then(async remoteMessage => {
    // if (remoteMessage) {
    // }
    await handleNotificationPress(remoteMessage);
  });

  onMessage(messaging, async remoteMessage => {
    const type = remoteMessage?.notification?.android?.channelId || 'general';

    await notifee.displayNotification({
      title: remoteMessage.notification?.title,
      body: remoteMessage.notification?.body,
      android: {
        channelId: type,
        sound: 'alert3',
        importance: AndroidImportance.HIGH,
        pressAction: {id: 'default'},
      },
      data: remoteMessage.data, // Keep data for press handling
    });
  });

  // Put this OUTSIDE onMessage — usually in App.js or a top-level useEffect
  notifee.onForegroundEvent(({type, detail}) => {
    if (type === EventType.PRESS) {
      handleNotificationPress(detail.notification);
    }
  });

  const handleNotificationPress = async (notification: any) => {
    console.log(notification);
    if (notification && notification?.data?.notification_type == 'video_call') {
      try {
        const parsedData = JSON.parse(notification?.data?.appointment);
        const data = await filterAppointment(
          parsedData?.mrn,
          parsedData?.his_booking_id,
        );
        console.log('filtered appointment', data);

        navigate('MyAppointmentDetails', {
          appointmentData: {...data, join: true},
        });
        // navigate('MyAppointmentDetails', { appointmentData: {...data, join: true} });
      } catch (e) {
        console.error('Error handling press:', e);
      }
    } else if (
      notification &&
      notification?.data?.notification_type == 'chat'
    ) {
      try {
        const parsedData = JSON.parse(notification?.data?.appointment);
        const data = await filterAppointment(
          parsedData?.mrn,
          parsedData?.his_booking_id,
        );
        console.log('filtered appointment', data);

        navigate('MyAppointmentDetails', {
          appointmentData: {...data, chat: true},
        });
        // navigate('MyAppointmentDetails', { appointmentData: {...data, join: true} });
      } catch (e) {
        console.error('Error handling press:', e);
      }
    } else {
      try {
        const parsedData = JSON.parse(notification?.data?.appointment);
        const data = await filterAppointment(
          parsedData?.mrn,
          parsedData?.his_booking_id,
        );
        console.log('filtered appointment', data);

        navigate('MyAppointmentDetails', {
          appointmentData: {...data, openPrescription: true},
        });
        // navigate('MyAppointmentDetails', { appointmentData: {...data, join: true} });
      } catch (e) {
        console.error('Error handling press:', e);
      }
    }
  };

  setBackgroundMessageHandler(messaging, async remoteMessage => {
    // let type = remoteMessage?.notification?.android?.channelId;
    // let channelId = 'general';
    // if (type === 'appointment') channelId = 'appointment';
    // else if (type === 'critical') channelId = 'critical';
    // await notifee.displayNotification({
    //   title: remoteMessage.notification?.title,
    //   body: remoteMessage.notification?.body,
    //   android: {channelId, sound: 'alert3', importance: AndroidImportance.HIGH},
    // });
  });
};
