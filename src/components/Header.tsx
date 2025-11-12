import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {useNavigation} from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  Animated,
  TouchableWithoutFeedback,
  Linking,
} from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useApp} from '../context/app-context';
import {Branch} from '../services/Region/api';
import {
  fetchFamilyMembers,
  getBranches,
  getNotificationCount,
  getPatientProfile,
  getRegions,
} from '../services/common';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  findNearestRegion,
  findNearestBranch,
} from '../services/Region/location';
import {getCurrentCoordinates, ToastService} from '../utils/service-handlers';
import {pallette, w} from '../constants/constants';
import {adjust, navigateTo} from '../utils/common-functions';
import {HeaderProps, NavProp} from '../types/components';
import {routes} from '../utils';
import {MainStackParamList} from '../types/navigation';
import WarningModal from './custom-warning';

const STORAGE_KEYS = {
  BRANCH: 'branch',
  REGION: 'region',
  PATIENT: 'patient',
};

const images = {
  arrow: require('../../assets/images/back-arrow.png'),
  profile: require('../../assets/images/profile-icon.png'),
  map: require('../../assets/images/map-icon.png'),
  services: require('../../assets/images/services-icon.png'),
  wallet: require('../../assets/images/wallet-icon.png'),
  filter: require('../../assets/images/filter-icon.png'),
  notification: require('../../assets/images/notification-icon.png'),
};

const Header = forwardRef<any, HeaderProps>(
  ({title, showLocation = true, showBack = true}, ref) => {
    const navigation = useNavigation<NavProp>();

    const [locationModalVisible, setLocationModalVisible] = useState(false);
    const [visible, setVisible] = useState(false);
    const [patientModalVisible, setPatientModalVisible] = useState(false);
    const [selectedRegion, setSelectedRegion] = useState<any>(null);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
    const [regions, setRegions] = useState<any[]>([]);
    const [familyMembers, setFamilyMembers] = useState<any[]>([]);
    const [branchesForRegion, setBranchesForRegion] = useState<Branch[]>([]);
    const [expandedRegionId, setExpandedRegionId] = useState<string | null>(
      null,
    );
    const [branchHeights, setBranchHeights] = useState<
      Record<string, Animated.Value>
    >({});
    const [mainPatient, setMainPatient] = useState();
    const [notificationCount, setNotificationCount] = useState(0);

    const {
      branch,
      region,
      patient,
      profile,
      category,
      updateAllBranch,
      updateBranch,
      updateRegion,
      updatePatient,
      updateProfile,
    } = useApp();

    /** 🔑 Expose modal controls to parent via ref */
    useImperativeHandle(ref, () => ({
      openModal: () => setLocationModalVisible(true),
      closeModal: () => setLocationModalVisible(false),
    }));

    /** Fetch Profile */
    useEffect(() => {
      const getProfile = async () => {
        try {
          const mrn = await AsyncStorage.getItem('mobileNumber');
          if (!mrn) return;
          const data = await getPatientProfile({MobileNo: mrn});
          const getPatientByRelations = (relations: string[]) =>
            data.data.find((item: any) =>
              relations.includes(item.relation?.toLowerCase()),
            ) || null;

          let mainPatient;
          if (category?.name === 'Child Care') {
            mainPatient =
              getPatientByRelations(['son', 'daughter']) ||
              getPatientByRelations(['self']) ||
              data.data[0];
          } else if (category?.name === 'Women Care') {
            mainPatient =
              getPatientByRelations(['spouse']) ||
              getPatientByRelations(['self']) ||
              data.data[0];
          } else {
            mainPatient =
              getPatientByRelations(['spouse']) ||
              getPatientByRelations(['self']) ||
              data.data[0];
          }
          setMainPatient(mainPatient);

          if (data?.data?.[0]?.PatientID) {
            updateProfile(mainPatient ? mainPatient : data.data[0]);
          }
        } catch (err: any) {
          ToastService.error(
            'Error',
            err?.response?.data?.message ||
              err?.message ||
              'Something went wrong while fetching profile',
          );
        }
      };
      getProfile();
    }, [updateProfile, category]);

    useEffect(() => {
      const getNotificationsCount = async () => {
        try {
          const data = await getNotificationCount();
          console.log(data);

          setNotificationCount(data?.data[0]?.value);
        } catch (err: any) {
          ToastService.error(
            'Error fetching notification count',
            err?.response?.data?.message ||
              err?.message ||
              'Something went wrong while fetching notification count',
          );
        }
      };
      getNotificationsCount();
    }, []);

    /** Initial load with persisted region/branch */
    useEffect(() => {
      const loadDetails = async () => {
        try {
          const savedBranch = await AsyncStorage.getItem(STORAGE_KEYS.BRANCH);
          const savedRegion = await AsyncStorage.getItem(STORAGE_KEYS.REGION);

          const regionData = await getRegions();
          const location = await getCurrentCoordinates();
          if (!location) return;

          let nearestRegion = null;

          if (savedRegion) {
            nearestRegion = JSON.parse(savedRegion);
          } else {
            nearestRegion = findNearestRegion(
              regionData,
              location.latitude,
              location.longitude,
            );
          }

          if (!nearestRegion) return;

          updateRegion(nearestRegion);

          const allBranches = await getBranches(nearestRegion.region_id);
          if (!allBranches.length) return;

          updateAllBranch(allBranches);

          if (branch) return;
          if (savedBranch) {
            updateBranch(JSON.parse(savedBranch));
          } else {
            const nearestBranch = findNearestBranch(
              allBranches,
              location.latitude,
              location.longitude,
            );
            if (nearestBranch) {
              updateBranch(nearestBranch);
              await AsyncStorage.setItem(
                STORAGE_KEYS.BRANCH,
                JSON.stringify(nearestBranch),
              );
            }
          }
        } catch (error: any) {
          ToastService.error(
            'Error',
            error?.response?.data?.message ||
              error?.message ||
              'Something went wrong',
          );
        }
      };
      loadDetails();
    }, [branch, updateAllBranch, updateBranch, updateRegion]);

    /** Load all regions & pre-initialize Animated.Values */
    useEffect(() => {
      getRegions()
        .then(data => {
          setRegions(data);
          const initialHeights: Record<string, Animated.Value> = {};
          data.forEach((r: any) => {
            initialHeights[r.region_id] = new Animated.Value(0);
          });
          setBranchHeights(initialHeights);
        })
        .catch(err => console.error('Failed to load regions:', err));
    }, []);

    useEffect(() => {
      const fetchMembers = async () => {
        try {
          const response = await fetchFamilyMembers({
            MobileNo: await AsyncStorage.getItem('mobileNumber'),
          });

          if (response?.status === 200) {
            setFamilyMembers(response.data);
          } else {
            ToastService.error(
              'Error',
              response?.message || 'Unable to fetch patients',
            );
          }
        } catch (error: any) {
          ToastService.error(
            'Error',
            error?.response?.data?.message ||
              error?.message ||
              'Something went wrong',
          );
        }
      };

      fetchMembers();
    }, []);

    /** Sync local selections with context */
    useEffect(() => {
      setSelectedBranch(branch || null);
      setSelectedRegion(region || null);
    }, [branch, region]);

    /** Handlers */
    const handleGoBack = useCallback(() => {
      navigation.goBack();
    }, [navigation]);

    const handleOpenModal = useCallback(() => {
      setLocationModalVisible(true);
    }, []);

    const handleCloseModal = useCallback(() => {
      setLocationModalVisible(false);
    }, []);

    const handleOpenPatientModal = useCallback(() => {
      setPatientModalVisible(true);
    }, []);

    const handleClosePatientModal = useCallback(() => {
      setPatientModalVisible(false);
    }, []);

    const handleBranchUpdate = useCallback(async () => {
      if (selectedBranch && selectedRegion) {
        updateBranch(selectedBranch);
        updateRegion(selectedRegion);
        setLocationModalVisible(false);

        await AsyncStorage.setItem(
          STORAGE_KEYS.BRANCH,
          JSON.stringify(selectedBranch),
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.REGION,
          JSON.stringify(selectedRegion),
        );
      }
    }, [selectedBranch, selectedRegion, updateBranch, updateRegion]);

    const handlePatientUpdate = useCallback(async () => {
      if (selectedBranch && selectedRegion) {
        updatePatient(selectedRegion);
        setPatientModalVisible(false);

        await AsyncStorage.setItem(
          STORAGE_KEYS.PATIENT,
          JSON.stringify(selectedPatient),
        );
      }
    }, [selectedPatient, updateRegion]);

    const toggleRegion = useCallback(
      async (regionItem: any) => {
        const id = regionItem.region_id;
        const isExpanded = expandedRegionId === id;

        if (expandedRegionId && expandedRegionId !== id) {
          Animated.timing(branchHeights[expandedRegionId], {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }

        if (isExpanded) {
          Animated.timing(branchHeights[id], {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }).start(() => setExpandedRegionId(null));
        } else {
          const branches = await getBranches(id);
          setBranchesForRegion(branches);
          setExpandedRegionId(id);
          Animated.timing(branchHeights[id], {
            toValue: branches.length * 50,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
      },
      [expandedRegionId, branchHeights],
    );

    /** Memoized modal content */
    const regionList = useMemo(
      () =>
        regions.map(regionItem => {
          const isExpanded = expandedRegionId === regionItem.region_id;
          const animatedHeight = branchHeights[regionItem.region_id];

          return (
            <View key={regionItem.region_id}>
              <TouchableOpacity
                style={[
                  styles.locationOption,
                  isExpanded && styles.selectedLocationOption,
                ]}
                onPress={() => {
                  toggleRegion(regionItem);
                  setSelectedRegion(regionItem);
                }}>
                <View style={styles.regionRow}>
                  <View style={{flexDirection: 'row', gap: w * 0.02}}>
                    <Text
                      style={[
                        styles.locationOptionText,
                        isExpanded && styles.selectedLocationText,
                      ]}>
                      {regionItem.name}
                    </Text>
                    {region?.region_id == regionItem?.region_id &&
                      !isExpanded && (
                        <Ionicons
                          name={'checkmark-circle-outline'}
                          size={20}
                          color="#000"
                        />
                      )}
                  </View>
                  <FontAwesome
                    name={isExpanded ? 'angle-up' : 'angle-down'}
                    size={20}
                    color="#888"
                  />
                </View>
              </TouchableOpacity>
              <Animated.View
                style={{height: animatedHeight, overflow: 'hidden'}}>
                {isExpanded &&
                  branchesForRegion.map((b, idx) => (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.locationOption,
                        selectedBranch?.id === b.id &&
                          styles.selectedLocationOption,
                      ]}
                      onPress={() => {
                        setSelectedBranch(b);
                      }}>
                      <Text
                        style={[
                          styles.locationOptionText,
                          selectedBranch?.id === b.id &&
                            styles.selectedLocationText,
                        ]}>
                        {idx + 1}. {b.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </Animated.View>
            </View>
          );
        }),
      [
        regions,
        expandedRegionId,
        branchHeights,
        branchesForRegion,
        selectedBranch,
        toggleRegion,
      ],
    );

    const familyList = useMemo(
      () =>
        familyMembers.map(familyMember => {
          return (
            <View key={familyMember.region_id}>
              <TouchableOpacity
                style={[styles.locationOption]}
                onPress={() => {
                  handlePatientUpdate();
                  setSelectedPatient(familyMember);
                }}>
                <View style={styles.regionRow}>
                  <View style={{flexDirection: 'row', gap: w * 0.02}}>
                    <Text style={[styles.locationOptionText]}>
                      {familyMember.PatientName}
                    </Text>
                    {/* {region?.region_id == regionItem?.region_id &&
                      !isExpanded && (
                        <Ionicons
                          name={'checkmark-circle-outline'}
                          size={20}
                          color="#000"
                        />
                      )} */}
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          );
        }),
      [
        regions,
        expandedRegionId,
        branchHeights,
        branchesForRegion,
        selectedBranch,
        toggleRegion,
      ],
    );

    return (
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {showBack ? (
            <TouchableOpacity
              onPress={handleGoBack}
              style={styles.backArrowBlock}>
              <Image
                source={images.arrow}
                style={styles.arrowIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleOpenPatientModal}
              disabled={true}
              style={styles.profileIconBlock}>
              <Image
                source={images.profile}
                style={styles.profileIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}

          {showLocation ? (
            <TouchableOpacity
              style={styles.dropdownIcon}
              onPress={handleOpenModal}>
              <View style={{marginLeft: w * 0.02}}>
                <Text style={styles.locationText}>
                  {/* {branch?.name || 'Fetching location...'} */}
                  {mainPatient?.PatientName ?? 'Fetching User...'}
                </Text>
                <View style={styles.locationInfo}>
                  {/* <Image source={images.map} style={styles.mapIcon} />
                  <Text
                    numberOfLines={1}
                    style={[styles.regionText, {width: '25%'}]}>
                    {`${branch?.name},` || 'loading...'}
                  </Text> */}
                  <Text style={styles.regionText}>
                    {`${mainPatient?.PatientID}` || 'Fetching...'}
                  </Text>
                  {/* <FontAwesome
                    name={'angle-down'}
                    size={w * 0.045}
                    color={pallette.white}
                  /> */}
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            title && <Text style={styles.headerTitle}>{title}</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${18002122}`)}>
            <Image
              source={images.services}
              style={styles.serviceIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              navigateTo(
                navigation,
                routes.Notifications as keyof MainStackParamList,
              )
            }>
            <Image
              source={images.notification}
              style={styles.notificationIcon}
              resizeMode="contain"
            />
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{notificationCount || 0}</Text>
            </View>
          </TouchableOpacity>

          {/* <TouchableOpacity onPress={() => setVisible(true)}>
            <Image
              source={images.wallet}
              style={styles.walletIcon}
              resizeMode="contain"
            />
          </TouchableOpacity> */}

          {title !== 'menu' && (
            <TouchableOpacity
              onPress={() =>
                navigateTo(navigation, routes.Home as keyof MainStackParamList)
              }>
              <Image
                source={images.filter}
                style={styles.filterIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
        </View>

        <WarningModal
          visible={visible}
          onClose={() => {
            setVisible(false);
          }}
          title="Coming Soon"
          message={'This feature will be enabled in the future versions.'}
          highlightText=""
          buttonText="Okay"
        />
        {/* Location Modal */}
        <Modal
          animationType="slide"
          transparent
          visible={locationModalVisible}
          onRequestClose={handleCloseModal}>
          <TouchableWithoutFeedback onPress={handleCloseModal}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>
                    📍 Select Region & Branch
                  </Text>
                  <ScrollView style={{maxHeight: 400}}>{regionList}</ScrollView>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.updateButton, {marginRight: 8}]}
                      disabled={!selectedBranch}
                      onPress={handleBranchUpdate}>
                      <Text style={styles.updateButtonText}>Update</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCloseModal}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Patient Modal */}
        <Modal
          animationType="slide"
          transparent
          visible={patientModalVisible}
          onRequestClose={handleClosePatientModal}>
          <TouchableWithoutFeedback onPress={handleClosePatientModal}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Patient</Text>
                  <ScrollView style={{maxHeight: 400}}>{familyList}</ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  header: {
    backgroundColor: pallette.dark_purple,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomLeftRadius: w * 0.07,
    borderBottomRightRadius: w * 0.07,
  },
  headerLeft: {flexDirection: 'row', alignItems: 'center'},
  profileIconBlock: {
    width: w * 0.1,
    height: w * 0.1,
    backgroundColor: pallette.white,
    borderRadius: w,
    borderWidth: 3,
    borderColor: pallette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: {width: w * 0.08, height: w * 0.08},
  backArrowBlock: {
    width: w * 0.08,
    height: w * 0.08,
    borderRadius: w,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  arrowIcon: {width: w * 0.05, height: w * 0.05, tintColor: pallette.white},
  headerTitle: {color: pallette.white, fontSize: adjust(16), paddingStart: 10},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: w * 0.03},
  dropdownIcon: {marginLeft: 0, padding: 4},
  locationText: {
    fontSize: adjust(12),
    color: pallette.white,
    fontFamily: 'ProximaNovaA-Regular',
    textAlign: 'left',
  },
  locationInfo: {flexDirection: 'row', alignItems: 'center', gap: 5},
  mapIcon: {width: w * 0.032, height: w * 0.032},
  regionText: {
    fontSize: adjust(10),
    color: pallette.white,
    fontFamily: 'ProximaNovaA-Regular',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: pallette.black,
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: adjust(16),
    fontWeight: 'bold',
    marginBottom: 10,
    color: pallette.black,
  },
  locationOption: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0ff',
  },
  selectedLocationOption: {backgroundColor: '#fbf1ffff'},
  locationOptionText: {fontSize: adjust(14), color: pallette.black},
  selectedLocationText: {color: pallette.amethyst, fontWeight: 'bold'},
  regionRow: {flexDirection: 'row', justifyContent: 'space-between'},
  buttonRow: {flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20},
  updateButton: {
    backgroundColor: pallette.amethyst,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  updateButtonText: {color: 'white', fontWeight: '600'},
  cancelButton: {paddingVertical: 10, paddingHorizontal: 20},
  cancelButtonText: {color: pallette.dark_grey, fontWeight: '600'},
  serviceIcon: {width: w * 0.06, height: w * 0.06},
  notificationIcon: {width: w * 0.05, height: w * 0.05},
  walletIcon: {width: w * 0.065, height: w * 0.065},
  filterIcon: {width: w * 0.06, height: w * 0.06},

  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -10,
    borderRadius: 10,
    minWidth: w * 0.06,
    height: w * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    backgroundColor: pallette.dark_purple,
  },

  unreadText: {
    color: 'white',
    fontSize: adjust(8),
    fontWeight: 'bold',
  },
});

export default React.memo(Header);
