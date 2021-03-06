/*
--------------------------------------------------------------------------------
Standardised metadata for a given image or video
This is based on parsing "provider data" such as Exiftool or Picasa
--------------------------------------------------------------------------------
*/

const moment = require('moment')
const path = require('path')

// mime type for videos
const MIME_VIDEO_REGEX = /^video\/.*$/

// standard EXIF date format, which is different from ISO8601
const EXIF_DATE_FORMAT = 'YYYY:MM:DD HH:mm:ssZ'

// infer dates from files with a date-looking filename
const FILENAME_DATE_REGEX = /\d{4}[_\-.\s]?(\d{2}[_\-.\s]?){5}\..{3,4}/

// moment ignores non-numeric characters when parsing
const FILENAME_DATE_FORMAT = 'YYYYMMDD HHmmss'

class Metadata {
  constructor (exiftool, picasa, opts) {
    // standardise metadata
    this.date = getDate(exiftool)
    this.caption = caption(exiftool)
    this.keywords = keywords(exiftool, picasa)
    this.video = video(exiftool)
    this.animated = animated(exiftool)
    this.rating = rating(exiftool)
    this.favourite = favourite(picasa)
    const size = dimensions(exiftool)
    this.width = size.width
    this.height = size.height
    this.exif = opts ? (opts.embedExif ? mergedExif(exiftool) : undefined) : undefined
    // metadata could also include fields like
    //  - lat = 51.5
    //  - long = 0.12
    //  - country = "England"
    //  - city = "London"
    //  - aperture = 1.8
  }
}

// Looks at the given EXIF data, and fills in missing values, which we know to be available but under a different key
function mergedExif(exiftool) {
  const { EXIF, QuickTime, Composite } = exiftool;
  return { ...EXIF,
    DateTimeOriginal: EXIF.DateTimeOriginal || QuickTime.MediaCreateDate, // Specimen: iPhone 5S video (MOV)
    Model: EXIF.Model || QuickTime.Model, // Specimen: iPhone 5S video (MOV)
    Make: EXIF.Make || QuickTime.Make, // Specimen: iPhone 5S video (MOV)
    GPSLatitude: EXIF.GPSLatitude || Composite.GPSLatitude, // Specimen: iPhone 5S video (MOV)
    GPSLongitude: EXIF.GPSLongitude || Composite.GPSLongitude, // Specimen: iPhone 5S video (MOV)
    GPSAltitude: EXIF.GPSAltitude || QuickTime.GPSAltitude, // Specimen: iPhone 5S video (MOV)
  };
}

// Returns the MOST LIKELY correct creation date for the current media
// @example 1580566344000
function getDate (exif) {
  // first, check if there's a valid date in the metadata
  const metadate = getMetaDate(exif)
  if (metadate) return metadate.valueOf()
  // next, check if the filename looks like a date
  const namedate = getFilenameDate(exif)
  if (namedate) return namedate.valueOf()
  // otherwise, fallback to the last modified date
  return moment(exif.File.FileModifyDate, EXIF_DATE_FORMAT).valueOf()
}

// Returns the MOST LIKELY correct metadata-based creation date for the current media
// @example "2020:02:01 16:12:24+02:00"
function getRawMetaDate (exif) {
  return tagValue(exif, 'EXIF', 'DateTimeOriginal') ||
         tagValue(exif, 'H264', 'DateTimeOriginal') ||
         tagValue(exif, 'QuickTime', 'DateTimeOriginal') ||
         tagValue(exif, 'QuickTime', 'ContentCreateDate') ||
         tagValue(exif, 'QuickTime', 'CreationDate') ||
         tagValue(exif, 'QuickTime', 'CreateDate')
}

// Same as getRawMetaDate(), but as a parsed Moment object
function getMetaDate (exif) {
  const date = getRawMetaDate(exif);
  if (date) {
    const parsed = moment(date, EXIF_DATE_FORMAT)
    if (parsed.isValid()) return parsed
  }
  return null
}

function getFilenameDate (exif) {
  const filename = path.basename(exif.SourceFile)
  if (FILENAME_DATE_REGEX.test(filename)) {
    const parsed = moment(filename, FILENAME_DATE_FORMAT)
    if (parsed.isValid()) return parsed
  }
  return null
}

function caption (exif, picasa) {
  return picasaValue(picasa, 'caption') ||
         // First prefer "Description" if available
         tagValue(exif, 'EXIF', 'Description') ||
         tagValue(exif, 'XMP', 'Description') ||
         tagValue(exif, 'EXIF', 'ImageDescription') ||
         // Then "Title"
         tagValue(exif, 'EXIF', 'Title') ||
         tagValue(exif, 'XMP', 'Title') ||
         tagValue(exif, 'QuickTime', 'Title') ||
         // Finally, some other educated guesses
         tagValue(exif, 'IPTC', 'Caption-Abstract') ||
         tagValue(exif, 'IPTC', 'Headline') ||
         tagValue(exif, 'XMP', 'Label')
}

function keywords (exif, picasa) {
  // try Picasa (comma-separated)
  const picasaValues = picasaValue(picasa, 'keywords')
  if (picasaValues) return picasaValues.split(',')
  // try IPTC (string or array)
  const iptcValues = tagValue(exif, 'IPTC', 'Keywords')
  if (iptcValues) return makeArray(iptcValues)
  // no keywords
  return []
}

function video (exif) {
  return MIME_VIDEO_REGEX.test(exif.File['MIMEType'])
}

function animated (exif) {
  if (exif.File['MIMEType'] !== 'image/gif') return false
  if (exif.GIF && exif.GIF.FrameCount > 0) return true
  return false
}

function rating (exif) {
  if (!exif.XMP) return 0
  return exif.XMP['Rating'] || 0
}

function favourite (picasa) {
  return picasaValue(picasa, 'star') === 'yes'
}

function tagValue (exif, type, name) {
  if (!exif[type]) return null
  return exif[type][name]
}

function picasaValue (picasa, name) {
  if (typeof picasa !== 'object') return null
  return picasa[name]
}

function makeArray (value) {
  return Array.isArray(value) ? value : [value]
}

function dimensions (exif) {
  // Use the Composite field to avoid having to check all possible tag groups (EXIF, QuickTime, ASF...)
  if (!exif.Composite) {
    return {
      width: null,
      height: null
    }
  } else {
    const size = exif.Composite.ImageSize
    const x = size.indexOf('x')
    return {
      width: parseInt(size.substr(0, x), 10),
      height: parseInt(size.substr(x + 1), 10)
    }
  }
}

module.exports = Metadata
