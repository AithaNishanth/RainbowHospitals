import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
} from 'react-native';
import React, {useEffect, useState} from 'react';
import {Text, Modal, Portal, TextInput} from 'react-native-paper';
import {Header} from '../../components';
import Footer from '../../components/footer';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {MainStackParamList} from '../../types/navigation';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  isBeforeTwoHours,
  adjust,
  isAfterTwoHours,
  isPreviousDay,
} from '../../utils/common-functions';
import {
  bookAppointment,
  sendPatientPushNotification,
  uploadPatientVitals,
} from '../../services/common';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ToastService} from '../../utils/service-handlers';
import {pallette} from '../../constants/constants';
import Loader from '../../components/loader';
import {useJitsi} from '../../context/jitsi-context';
import {AppointmentPayload} from '../../utils/types';
import moment from 'moment';
import {API_BASE_URL, API_IMG_URL, routes} from '../../utils';

type VitalKey = 'height' | 'weight' | 'temperature';
type BankKey =
  | 'bank_name'
  | 'account_number'
  | 'ifsc_code'
  | 'account_holder_name'
  | 'branch_name';
const MyAppointmentDetails: React.FC<any> = ({route}) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const {appointmentData, cancel, vitalsUpload} = route.params;
  console.log(appointmentData?.prescription);
  
  const dateTime = moment().format();

  const [visible, setVisible] = React.useState(cancel || false);
  const [vitalsModalVisible, setvitalsModalVisible] = React.useState(
    vitalsUpload || false,
  );
  const [loading, setLoading] = useState(false);
  const {showJitsi} = useJitsi();

  const showModal = () => setVisible(true);
  const hideModal = () => setVisible(false);
  const showVitalsModal = () => setvitalsModalVisible(true);
  const hideVitalsModal = () => setvitalsModalVisible(false);

  const [bank_details, setBank_details] = useState({
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    branch_name: '',
  });
  const [vitals, setVitals] = useState({
    height: appointmentData?.vitals?.height || '',
    weight: appointmentData?.vitals?.weight || '',
    temperature: appointmentData?.vitals?.temperature || '',
  });
  const vitalFields = [
    {key: 'height', label: 'Height (in cm) (Normal Range - Based on age)'},
    {key: 'weight', label: 'Weight (in Kgs) (Normal Range - Based on BMI)'},
    {
      key: 'temperature',
      label: 'Temperature (in °F) (Normal Range - 97.5 to 99.5)',
    },
  ];

  const bankFields = [
    {key: 'bank_name', label: 'BANK NAME'},
    {
      key: 'account_number',
      label: 'ACCOUNT NUMBER',
    },
    {
      key: 'ifsc_code',
      label: 'IFSC CODE',
    },
    {
      key: 'account_holder_name',
      label: 'ACCOUNT HOLDER NAME',
    },
    {
      key: 'branch_name',
      label: 'BRANCH NAME',
    },
  ];

  useEffect(() => {
    if (appointmentData?.join) {
      startVideoCall();
    }
  }, []);

  useEffect(() => {
    if (appointmentData?.chat) {
      navigation.navigate('AppointmentChat', {
        bookingId: appointmentData.appointmentnumber,
        doctor: appointmentData.CareProviderName,
        appointmentData: appointmentData,
      });
    }
  }, []);

  useEffect(() => {
    if (appointmentData?.openPrescription) {
      navigation.navigate(routes.PDFPreview, {
        source: {
          uri: `${API_IMG_URL}${appointmentData?.prescription_file}`,
        },
      });
    }
  }, []);

  const cancelAppointment = async () => {
    const obj: AppointmentPayload = {
      status: 'CANCEL',
      appointmentnumber: appointmentData?.BookingUID,
      comment: '',
      mrn: (await AsyncStorage.getItem('mrn')) || '',
      OrganisationUID: appointmentData?.OrganisationUID,
      AppointmentType: appointmentData?.AppointmentType,
      bank_details,
    };
    try {
      const response = await bookAppointment(obj);
      if (response?.status == 200 && response?.success) {
        setLoading(false);
        ToastService.success('Success', 'Appointment Cancelled Successfully');
        navigation.goBack();
      } else {
        setLoading(false);
        ToastService.error('Error', response.message);
      }
    } catch (error: any) {
      setLoading(false);
      ToastService.error(
        'Error',
        error?.response?.data?.message ||
          error?.message ||
          'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  };

  const uploadVitals = async () => {
    const obj = {
      appointmentnumber: appointmentData?.BookingUID,
      mrn: (await AsyncStorage.getItem('mrn')) || '',
      OrganisationUID: appointmentData?.OrganisationUID,
      height: vitals.height ? parseFloat(vitals.height) : undefined,
      weight: vitals.weight ? parseFloat(vitals.weight) : undefined,
      temperature: vitals.temperature
        ? parseFloat(vitals.temperature)
        : undefined,
    };
    try {
      const response = await uploadPatientVitals(obj);
      if (response?.status == 200 && response?.success) {
        setLoading(false);
        ToastService.success('Success', 'Vitals Uploaded Successfully');
        navigation.goBack();
      } else {
        setLoading(false);
        ToastService.error('Error', response.message);
      }
    } catch (error: any) {
      setLoading(false);
      ToastService.error(
        'Error Uploading Vitals',
        error?.response?.data?.message ||
          error?.message ||
          'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    try {
      const response = await sendPatientPushNotification({
        BookingUID: appointmentData?.BookingUID,
        notifyTo: 'doctor',
      });
      startVideoCall();
    } catch (error: any) {
      console.error('Error fetching visits:', error);
      // ToastService.error(
      //   'Error',
      //   error?.response?.data?.message ||
      //     error?.message ||
      //     'Something went wrong',
      // );
      startVideoCall();
    }
  };

  const startVideoCall = () => {
    setLoading(false);
    showJitsi({
      roomName: appointmentData?.roomId || 'SampleJitsiCall',
      token: '',
      serverURL: 'https://dev.rb.vc.demos.im/',
      patient: {
        name: appointmentData?.PatientName,
        mobile: appointmentData?.patient?.mobile_no,
        email: appointmentData?.patient?.email_id,
        time: formatAppointmentTime(appointmentData?.SlotStartDttm),
      },
      doctor: {
        name: appointmentData?.SessionName,
        time: formatAppointmentTime(appointmentData?.SlotStartDttm),
      },
      bookingId: appointmentData?.BookingUID,
      careprovider: appointmentData?.CareProviderCode,
    });
  };

  return (
    <View style={styles.mainContainer}>
      <Header showLocation title={undefined} />

      {/* Action Buttons Row */}
      <View style={styles.actionsRow}>
        {appointmentData?.payment_type?.toLowerCase() == 'payu' && (
          <TouchableOpacity
            // disabled={
            //   appointmentData?.unreadCount == 0 ||
            //   isBeforeTwoHours(dateTime, appointmentData?.SlotStartDttm, 1) ||
            //   isPreviousDay(appointmentData?.SlotStartDttm)
            // }
            onPress={() =>
              navigation.navigate('AppointmentChat', {
                bookingId: appointmentData.appointmentnumber,
                doctor: appointmentData.CareProviderName,
                appointmentData: appointmentData,
              })
            }>
            <Text
              style={[
                styles.actionBtnText,
                {
                  backgroundColor:
                    (appointmentData?.unreadCount == 0 &&
                      isBeforeTwoHours(
                        dateTime,
                        appointmentData?.SlotStartDttm,
                        1,
                      )) ||
                    isPreviousDay(appointmentData?.SlotStartDttm)
                      ? pallette.dark_grey
                      : pallette.dark_purple,
                },
              ]}>
              Chat
            </Text>
            {appointmentData?.unreadCount > 0 &&
              !isPreviousDay(appointmentData?.SlotStartDttm) && (
                <View
                  style={{
                    height: w * 0.05,
                    width: w * 0.05,
                    borderRadius: w,
                    backgroundColor: pallette.dark_purple,
                    position: 'absolute',
                    right: -(w * 0.01),
                    top: -(w * 0.01),
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                  <Text
                    style={{
                      fontSize: adjust(10),
                      color: pallette.white,
                    }}>
                    {appointmentData?.unreadCount}
                  </Text>
                </View>
              )}
          </TouchableOpacity>
        )}

        {appointmentData?.AppointmentType?.toLowerCase() !== 'physical' && (
          <TouchableOpacity
            // disabled={
            //   !isBeforeTwoHours(
            //     dateTime,
            //     appointmentData?.SlotStartDttm,
            //     0.25,
            //   ) ||
            //   isAfterTwoHours(dateTime, appointmentData?.SlotStartDttm, 0.25) ||
            //   isPreviousDay(appointmentData?.SlotStartDttm)
            // }
            onPress={sendNotification}>
            <Text
              style={[
                styles.actionBtnText,
                {
                  backgroundColor:
                    isBeforeTwoHours(
                      dateTime,
                      appointmentData?.SlotStartDttm,
                      0.25,
                    ) ||
                    isAfterTwoHours(
                      dateTime,
                      appointmentData?.SlotStartDttm,
                      0.25,
                    )
                      ? pallette.dark_grey
                      : pallette.dark_purple,
                },
              ]}>
              Join Call
            </Text>
          </TouchableOpacity>
        )}

        {/* <TouchableOpacity onPress={showVitalsModal}>
          <Text style={styles.actionBtnText}>Upload Vitals</Text>
        </TouchableOpacity> */}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {/* doctor details */}
          <View style={styles.doctorDetailsContainer}>
            <View style={styles.doctorImgContainer}>
              <Image
                source={
                  appointmentData.image
                    ? {uri: `${appointmentData.image}`}
                    : {
                        uri: 'https://cdn-icons-png.flaticon.com/512/387/387561.png',
                      }
                }
                style={styles.docImg}
              />
              <View style={styles.dotContainer}>
                <View style={styles.dot} />
              </View>
            </View>
            <View style={styles.doctorDetails}>
              <Text
                style={[
                  styles.docName,
                  {
                    fontSize: adjust(14),
                    color: '#4CC2BF',
                    fontFamily: 'ProximaNovaA-Semibold',
                  },
                ]}>
                {appointmentData?.CareProviderName ?? 'Doctor Name'}
              </Text>
              <Text
                style={[styles.docName, {fontSize: adjust(10), marginTop: 3}]}>
                {appointmentData?.SpecialtyName ?? 'Specialization'}
              </Text>

              <View style={styles.location}>
                <Image
                  source={require('../../../assets/images/map-icon.png')}
                  style={{width: 15, height: 15}}
                />
                <Text style={styles.locationText}>
                  {appointmentData?.OrganisationName ?? ''}
                </Text>
              </View>
            </View>
          </View>

          {/* patient info */}
          <View style={styles.patientInfo}>
            <Text style={styles.patientInfoHeaderText}>Patient Info</Text>
            <View>
              <View style={styles.patientItem}>
                <Image
                  source={require('../../../assets/images/user-icon.png')}
                  style={styles.patientImg}
                />
                <View>
                  <Text
                    style={{
                      fontSize: adjust(12),
                      color: '#6651AF',
                      fontFamily: 'ProximaNovaA-Bold',
                      marginBottom: 2,
                    }}>
                    #{appointmentData?.BookingUID ?? ''}
                  </Text>
                  <Text
                    style={{
                      fontSize: adjust(14),
                      color: '#6651AF',
                      fontFamily: 'ProximaNovaA-Semibold',
                      marginBottom: 6,
                    }}>
                    {appointmentData?.PatientName ?? ''}
                  </Text>
                  <View style={styles.patientReports}>
                    <Text style={styles.reports}>Appointment Type:</Text>
                    <Text
                      style={[
                        styles.reports,
                        {fontFamily: 'ProximaNovaA-Bold'},
                      ]}>
                      {appointmentData?.AppointmentType}
                    </Text>
                  </View>
                  <View style={styles.patientReports}>
                    <Text style={styles.reports}>Payment Type:</Text>
                    <Text
                      style={[
                        styles.reports,
                        {fontFamily: 'ProximaNovaA-Bold'},
                      ]}>
                      {appointmentData?.payment_type?.toLowerCase() == 'payu'
                        ? 'Paid Online'
                        : 'Pay At Hospital'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* time/date */}
          <View style={[styles.patientInfo, {marginTop: 15, borderRadius: 10}]}>
            <Text style={styles.patientInfoHeaderText}>Time Date</Text>
            <View style={styles.timeDateItem}>
              <View style={styles.timeFlexRow}>
                <Image
                  source={require('../../../assets/images/footer-calendar-icon.png')}
                  style={styles.timeIcon}
                />
                <Text
                  style={{
                    fontSize: adjust(12),
                    color: '#6651AF',
                    fontFamily: 'ProximaNovaA-Semibold',
                    marginBottom: 2,
                  }}>
                  {formatAppointmentDate(appointmentData?.SlotStartDttm)}
                </Text>
              </View>
              <View>
                <View style={styles.timeFlexRow}>
                  <Image
                    source={require('../../../assets/images/time-icon.png')}
                    style={styles.timeIcon}
                  />
                  <Text
                    style={{
                      fontSize: adjust(12),
                      color: '#6651AF',
                      fontFamily: 'ProximaNovaA-Semibold',
                      marginBottom: 2,
                    }}>
                    {formatAppointmentTime(appointmentData?.SlotStartDttm)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {appointmentData?.prescription_file && (
            <View
              style={[styles.patientInfo, {marginTop: 15, borderRadius: 10}]}>
              <Text style={styles.patientInfoHeaderText}>
                Prescription File
              </Text>
              <View style={styles.timeDateItem}>
                <View style={styles.timeFlexRow}>
                  <Text
                    style={{
                      color: '#fff',
                      fontSize: adjust(12),
                      fontWeight: 'bold',
                    }}>
                    📄
                  </Text>
                  <Text
                    style={{
                      fontSize: adjust(12),
                      color: '#6651AF',
                      fontFamily: 'ProximaNovaA-Semibold',
                      marginBottom: 2,
                    }}>
                    {`Doctor_Prescription.pdf`}
                  </Text>
                </View>
                <View>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate(routes.PDFPreview, {
                        source: {
                          uri: `${API_IMG_URL}${appointmentData?.prescription_file}`,
                        },
                      })
                    }
                    style={styles.timeFlexRow}>
                    <Text
                      style={{
                        fontSize: adjust(12),
                        color: '#6651AF',
                        fontFamily: 'ProximaNovaA-Semibold',
                        textDecorationLine: 'underline',
                        marginBottom: 2,
                      }}>
                      {`View`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <Text style={styles.acSubTitle}>
            Appointments can be rescheduled or cancelled up to{' '}
            <Text style={{fontWeight: 'bold', color: pallette.red}}>
              2 hours before the scheduled time.{' '}
            </Text>
            Any changes or cancellations made{' '}
            <Text style={{fontWeight: 'bold', color: pallette.red}}>
              within 2 hours of the appointment will not be accepted.{' '}
            </Text>
          </Text>

          {/* cancel + reschedule */}
          <View style={styles.payBtnsContainer}>
            <TouchableOpacity
              disabled={
                !isBeforeTwoHours(dateTime, appointmentData?.SlotStartDttm, 2)
              }
              onPress={() => showModal()}
              style={[
                styles.payBtn,
                {
                  backgroundColor: isBeforeTwoHours(
                    dateTime,
                    appointmentData?.SlotStartDttm,
                    2,
                  )
                    ? pallette.dark_purple
                    : pallette.dark_grey,
                },
              ]}>
              <Text style={styles.payBtnTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={
                !isBeforeTwoHours(dateTime, appointmentData?.SlotStartDttm, 2)
              }
              onPress={() =>
                navigation.navigate('DoctorSlots', {
                  doctorId: appointmentData?.id,
                  appointmentType: appointmentData?.AppointmentType,
                  appointmentnumber: appointmentData?.appointmentnumber,
                  OrganisationID: appointmentData?.OrganisationUID,
                  patientId: appointmentData?.PatientID,
                  paid: appointmentData?.payment_type?.toUpperCase() == 'PAYU',
                })
              }
              style={[
                styles.payBtn,
                {
                  backgroundColor: isBeforeTwoHours(
                    dateTime,
                    appointmentData?.SlotStartDttm,
                    2,
                  )
                    ? pallette.dark_purple
                    : pallette.dark_grey,
                },
              ]}>
              <Text style={styles.payBtnTxt}>Reschedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <Footer />

      {/* Cancel Modal */}
      <Portal>
        <Modal
          visible={visible}
          onDismiss={hideModal}
          contentContainerStyle={styles.modalWrapp}>
          <Text style={styles.formTitle}>Cancel Appointment</Text>
          <Text style={styles.formSubTitle}>
            Need Bank Details to refund the amount
          </Text>

          <View style={styles.formContainer}>
            {bankFields.map(({key, label}, idx) => (
              <View style={styles.formRow} key={idx}>
                <Text style={styles.formLabel}>{label}</Text>
                <TextInput
                  mode="flat"
                  underlineColor="transparent"
                  placeholderTextColor={pallette.dark_grey}
                  value={
                    bank_details[key as BankKey]
                      ? String(bank_details[key as BankKey])
                      : ''
                  }
                  style={styles.formInput}
                  onChangeText={text =>
                    setBank_details(prev => ({
                      ...prev,
                      [key]: text,
                    }))
                  }
                />
              </View>
            ))}

            <View style={styles.formRowBtn}>
              <TouchableOpacity
                onPress={() => hideModal()}
                style={[styles.formButton, {backgroundColor: 'grey'}]}>
                <Text style={styles.formButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => cancelAppointment()}
                style={styles.formButton}>
                <Text style={styles.formButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Portal>

      {/* Upload Vitals Modal */}
      <Portal>
        <Modal
          visible={vitalsModalVisible}
          onDismiss={hideVitalsModal}
          contentContainerStyle={styles.modalWrapp}>
          <Text style={styles.formTitle}>Upload Vitals</Text>
          <Text style={styles.formSubTitle}>
            Need Vital Details For Diagnosis
          </Text>

          <View style={styles.formContainer}>
            {vitalFields.map(({key, label}, idx) => (
              <View style={styles.formRow} key={idx}>
                <Text style={styles.formLabel}>{label}</Text>
                <TextInput
                  mode="flat"
                  underlineColor="transparent"
                  placeholderTextColor={pallette.dark_grey}
                  value={
                    vitals[key as VitalKey]
                      ? String(vitals[key as VitalKey])
                      : ''
                  }
                  style={styles.formInput}
                  keyboardType={'decimal-pad'}
                  onChangeText={text =>
                    setVitals(prev => ({
                      ...prev,
                      [key]: text,
                    }))
                  }
                />
              </View>
            ))}

            <View style={styles.formRowBtn}>
              <TouchableOpacity
                onPress={() => hideVitalsModal()}
                style={[styles.formButton, {backgroundColor: 'grey'}]}>
                <Text style={styles.formButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => uploadVitals()}
                style={styles.formButton}>
                <Text style={styles.formButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Portal>

      {loading && <Loader />}
    </View>
  );
};

export default MyAppointmentDetails;

const h = Dimensions.get('window').height;
const w = Dimensions.get('window').width;
const styles = StyleSheet.create({
  mainContainer: {
    backgroundColor: pallette.white,
    flex: 1,
  },
  scrollContent: {padding: 0, paddingBottom: 0},
  container: {flex: 1, paddingBottom: 50, paddingTop: 0, position: 'relative'},

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: w * 0.02,
    gap: w * 0.03,
    marginVertical: h * 0.02,
  },
  actionBtnText: {
    fontSize: adjust(14),
    fontFamily: 'ProximaNovaA-Semibold',
    color: pallette.white,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: pallette.dark_purple,
    borderRadius: 8,
    overflow: 'hidden',
  },

  doctorDetailsContainer: {
    backgroundColor: pallette.dark_purple,
    paddingHorizontal: 15,
    alignSelf: 'center',
    marginTop: h * 0.08,
    borderTopLeftRadius: w * 0.1,
    borderTopRightRadius: w * 0.1,
    width: '90%',
  },
  doctorImgContainer: {
    width: 100,
    height: 100,
    backgroundColor: pallette.white,
    borderRadius: h * 0.1,
    marginHorizontal: 'auto',
    borderWidth: 0.3,
    borderColor: 'grey',
    marginTop: -50,
    position: 'relative',
    marginBottom: 10,
  },
  docImg: {
    width: 100,
    height: 100,
    borderRadius: h * 0.1,
    resizeMode: 'cover',
  },
  dotContainer: {
    width: 20,
    height: 20,
    borderRadius: 100,
    backgroundColor: pallette.white,
    position: 'absolute',
    right: 10,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {height: 13, width: 13, borderRadius: 100, backgroundColor: '#4CC2BF'},
  doctorDetails: {
    padding: 8,
    backgroundColor: pallette.dark_purple,
    width: '100%',
  },
  docName: {
    fontSize: adjust(18),
    color: pallette.white,
    fontFamily: 'ProximaNovaA-Regular',
    textAlign: 'center',
  },

  patientInfo: {
    backgroundColor: '#F5F5FF',
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginHorizontal: 10,
    width: '90%',
    alignSelf: 'center',
  },
  patientInfoHeaderText: {
    fontSize: adjust(14),
    marginTop: 10,
    fontFamily: 'ProximaNovaA-Bold',
    color: pallette.dark_purple,
    textAlign: 'left',
  },
  location: {
    borderTopWidth: 1,
    borderTopColor: '#5B52A3',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    justifyContent: 'center',
    marginTop: 13,
    marginBottom: 10,
    paddingTop: 10,
  },
  locationText: {
    fontSize: adjust(12),
    fontFamily: 'ProximaNovaA-Semibold',
    color: pallette.white,
    textAlign: 'left',
  },
  patientItem: {marginTop: 15, flexDirection: 'row', alignItems: 'flex-start'},
  patientImg: {
    height: w * 0.1,
    width: w * 0.1,
    resizeMode: 'contain',
    marginRight: 10,
  },
  patientReports: {flexDirection: 'row', gap: 15, marginVertical: h * 0.01},
  reports: {
    fontSize: adjust(12),
    color: pallette.dark_purple,
    fontFamily: 'ProximaNovaA-Semibold',
  },

  timeDateItem: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeFlexRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  timeIcon: {width: 15, height: 15, resizeMode: 'contain'},

  acSubTitle: {
    fontSize: adjust(12),
    color: pallette.black,
    width: '80%',
    alignSelf: 'center',
    textAlign: 'center',
    marginTop: h * 0.02,
  },
  payBtnsContainer: {
    marginTop: 15,
    marginBottom: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  payBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  payBtnTxt: {
    color: pallette.white,
    fontSize: adjust(14),
    fontFamily: 'ProximaNovaA-Semibold',
  },

  modalWrapp: {
    backgroundColor: pallette.white,
    padding: 20,
    margin: 20,
    borderRadius: 10,
  },
  formTitle: {
    fontSize: adjust(16),
    fontFamily: 'ProximaNovaA-Bold',
    marginBottom: 5,
    color: pallette.dark_purple,
  },
  formSubTitle: {
    fontSize: adjust(12),
    fontFamily: 'ProximaNovaA-Regular',
    marginBottom: 10,
    color: '#555',
  },
  formContainer: {marginTop: 10},
  formRow: {marginBottom: 12},
  formLabel: {
    fontSize: adjust(12),
    fontFamily: 'ProximaNovaA-Semibold',
    marginBottom: 4,
    color: '#333',
  },
  formInput: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  formRowBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  formButton: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: pallette.dark_purple,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  formButtonText: {
    color: pallette.white,
    fontSize: adjust(14),
    fontFamily: 'ProximaNovaA-Semibold',
  },
});
