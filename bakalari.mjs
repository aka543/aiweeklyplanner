import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { get } from 'http';
import qs from 'qs';
dotenv.config();
console.log(process.env.BAK_USERNAME);

class Bakalari {
  constructor() {
    dotenv.config();
    this.username = process.env.BAK_USERNAME;
    this.password = process.env.BAK_PASSWORD;
    this.baseURL = 'https://gateway.gymvod.cz:444/api';
  }
  async login() {

    if (!this.username || !this.password) {
      throw new Error('Username or password not set in environment variables');
    }

    const data = qs.stringify({
      client_id: 'ANDR',
      grant_type: 'password',
      username: this.username,
      password: this.password
    });
    
    // LOG IN 
    let res2 = await axios.post(`${this.baseURL}/login`, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    this.accessToken = res2.data.access_token;
  }
  async getTimetableInfo() {
    if (!this.accessToken) {
      throw new Error('You must log in first');
    }
    let timetableRes = await axios.get(`${this.baseURL}/3/timetable/permanent`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`
      }
    })
    let timetable = timetableRes.data;
    let endingTimes = this.daysEndMap(timetable);
    let timetableInfo = {};
    timetable.Days.forEach(day => {
      let end;
      day.Atoms.length <= 0 ? end = '00:00' : end = endingTimes[(day.Atoms.length).toString()].end;
      timetableInfo[day.DayOfWeek] = {
        description: day.DayDescription,
        type: day.DayType,
        // date: day.Date,
        // atoms: day.Atoms,
        endingTime: end
      }
    });
    return timetableInfo;
  }
  async getTimetableInfoActual() {
    if (!this.accessToken) {
      throw new Error('You must log in first');
    }
    console.log(this.formatDate())
    let formattedDate = this.formatDate();
    let timetableRes = await axios.get(`${this.baseURL}/3/timetable/actual?date=${formattedDate}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`
      }
    })
    let timetable = timetableRes.data;
    let endingTimes = this.daysEndMap(timetable);
    let timetableInfo = {};
    timetable.Days.forEach(day => {
      let end;
      day.Atoms.length <= 0 ? end = '00:00' : end = endingTimes[(day.Atoms.length).toString()].end;
      timetableInfo[day.DayOfWeek] = {
        description: day.DayDescription,
        type: day.DayType,
        // date: day.Date,
        // atoms: day.Atoms,
        endingTime: end
      }
    });
    return timetableInfo;
  }
  daysEndMap(timetable) {
    let daysEnd = {};
    timetable.Hours.forEach(hour => {
      daysEnd[hour.Caption] = {
        begin: hour.BeginTime,
        end: hour.EndTime,
      }
    })
    return daysEnd;
  }
  formatDate() {
    let date = new Date();
    return date.toISOString().split('T')[0]
  }
  subjectMap(subjects) {
    let subjectMap = {};
    subjects.forEach(subject => {
      subjectMap[subject.SubjectID] = {
        name: subject.SubjectName,
        teacher: {name: subject.TeacherName,
          id: subject.TeacherID
        },
      };
    });
    return subjectMap;
  }
  async createTimetableMap() {
    let subjects = await axios.get(`${this.baseURL}/3/subjects`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.accessToken}`
      }
    });
    let subjectMapData = subjectMap(subjects.data.Subjects);
    let jsonString = JSON.stringify(subjectMapData);
    fs.writeFile('./subjectsMap.json', jsonString, err => {
      if (err) {
          console.log('Error writing file', err)
      } else {
          console.log('Successfully wrote file')
      }
    })
  }
}

// async function main() {
//   let bakalari = new Bakalari();
//   await bakalari.login()
//   let timetableInfo = await bakalari.getTimetableInfoActual();
//   console.log(timetableInfo);
// }
// main();

export default Bakalari;



