import { getPrisma } from "../index.js";
import { MeetingRepository } from "./meeting.repository.js";
import { RoomRepository } from "./room.repository.js";

export const meetingRepository = new MeetingRepository(getPrisma());
export const roomRepository = new RoomRepository(getPrisma());
