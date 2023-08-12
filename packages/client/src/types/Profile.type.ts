import { Event, Run } from './Happenings.type';

export type Profile = {
    id: number;
    username: string;
    avatar: string | null;
    createdAt: string;
    roles: any[]; //FIXME: WHAT'S THE TYPE OF IT?
    tier: number;
    verified: boolean;
    isFollowing: boolean;
    reviews: {
        id: number;
        review: string;
        createdAt: string;
        rate: number;
        author: {
            id: number;
            username: string;
            avatar: string | null;
        };
    }[];
    happenings: {
        events: Event[];
        runs: Run[];
    };
    _count: {
        followers: number;
        following: number;
        playedRuns: number;
        playedEvents: number;
    };
};
