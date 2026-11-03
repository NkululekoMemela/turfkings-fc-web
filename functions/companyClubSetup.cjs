const clean=(value,max=160)=>typeof value==="string"?value.trim().slice(0,max):"";
function companyClubSetup(input={}){
 const required=["clubName","venueName","address","suburb","city","country","playDay","playTime","playEndTime","timezone"];
 const result=Object.fromEntries([...required,"province","googlePlaceId","founderFirstName","founderSurname","captainName","captainWhatsApp"].map(key=>[key,clean(input[key],key==="address"?400:160)]));
 if(required.some(key=>!result[key]))throw Error("Complete the Club details, venue, location, playing day and start/end times before creating a Company Club.");
 if(!["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].includes(result.playDay)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(result.playTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(result.playEndTime)||result.playTime===result.playEndTime)throw Error("Choose a playing day and valid start/end times.");
 const latitude=input.latitude,longitude=input.longitude;
 if(typeof latitude!=="number"||!Number.isFinite(latitude)||Math.abs(latitude)>90||typeof longitude!=="number"||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw Error("Select the playing venue from Google so its map location is saved.");
 try{new Intl.DateTimeFormat('en',{timeZone:result.timezone});}catch{throw Error("Choose a valid timezone.");}
 for(const key of ["homeColor","awayColor"]){
  const value=clean(input[key],7);if(value&&!/^#[0-9a-f]{6}$/i.test(value))throw Error("Choose valid Club colours.");
  if(value)result[key]=value;
 }
 result.latitude=latitude;result.longitude=longitude;
 result.weeklyPlayTime=`${result.playDay}s · ${result.playTime}–${result.playEndTime}`;
 result.locationDetails={venueName:result.venueName,address:result.address,fullAddress:result.address,suburb:result.suburb,city:result.city,province:result.province,country:result.country,latitude,longitude,placeId:result.googlePlaceId,displayLocation:[result.suburb,result.city].join(", ")};
 result.schedule={playDay:result.playDay,playTime:result.playTime,playEndTime:result.playEndTime,weeklyPlayTime:result.weeklyPlayTime,timezone:result.timezone};
 return result;
}
function emptyCompanyFootballState(clubId){const now=new Date().toISOString();return {clubId,activeSeasonId:'season-1',seasons:[{seasonId:'season-1',seasonNo:1,teams:[],fiveVFiveTeams:[],currentMatchNo:1,currentMatch:{teamAId:null,teamBId:null,standbyId:null},currentEvents:[],allEvents:[],results:[],matchDayHistory:[],streaks:{},createdAt:now,updatedAt:now}],playerPhotosByName:{},yearEndAttendance:[],updatedAt:now};}
module.exports={companyClubSetup,emptyCompanyFootballState};
