/**
 * What teacher attendance does with location — shown before the location permission is requested
 * (Getting started, Teacher Check-in). It must keep matching TeacherAttendanceService: check-in
 * coordinates and distance are stored on teacher_attendance; check-out coordinates are not.
 */
export const ATTENDANCE_LOCATION_DISCLOSURE =
  'Edunexify uses your device location when you check in or check out to verify that you are within '
  + 'your school\'s attendance area. Your check-in location and distance from the school are saved with '
  + 'your attendance record and may be viewed by authorised school administrators. Checkout location is '
  + 'used for verification but is not saved. Edunexify does not access your location in the background.';
