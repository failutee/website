import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Run, Event } from 'src/types/Happenings.type';
import { UsersService } from 'src/users/users.service';
import { HappeningType } from '@prisma/client';
import { HappeningsService } from 'src/happenings/happenings.service';

const PER_PAGE = 5;

type User = {
    username: string;
    avatar: string | null;
    tier: number;
    id: number;
    verified: boolean;
    _count: {
        followers: number;
        following: number;
    };
    isFollowing: boolean;
};

type SearchResult = (
    | ({ type: 'user' } & User)
    | ({ type: 'run' } & Run)
    | ({ type: 'event' } & Event)
)[];

@Injectable()
export class SearchService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly usersService: UsersService,
        private readonly happeningsService: HappeningsService,
    ) { }

    async search(
        userId: number,
        query: string,
        opts: {
            page: number;
        },
    ): Promise<{ results: SearchResult; next: boolean }> {
        //NOTE: ngl, ive no fucking clue how to do it correctly :(

        const searchResult: SearchResult = [];

        const theThing = `%${query.toLowerCase()}%`;

        const user: number | undefined = (
            await this.prismaService.$queryRaw<{ id: number }[]>`
            SELECT id FROM "User"
            WHERE LOWER(username) LIKE ${theThing} LIMIT 1
        `
        )[0]?.id;

        if (user) {
            const profile = await this.usersService.searchUserById(
                userId,
                user,
            );

            if (profile) {
                const isFollowing = await this.usersService.isFollowing(
                    userId,
                    profile.id,
                );

                if (opts.page === 0) {
                    searchResult.push({
                        type: 'user',
                        ...profile,
                        isFollowing,
                    });
                }
            }
        }

        const totalCountBigInt = (
            await this.prismaService.$queryRaw<[{ count: BigInt }]>`
            SELECT COUNT(*) FROM "Happening"
            INNER JOIN "User" ON "User".id = "Happening"."authorId"
            WHERE LOWER("User".username) LIKE ${theThing} OR
            LOWER("Happening".title) LIKE ${theThing} OR
            LOWER("Happening".description) LIKE ${theThing} OR
            LOWER("Happening"."mapName") LIKE ${theThing}
        `
        )[0].count;

        const totalCount = Number(totalCountBigInt);

        const happenings = await this.prismaService.$queryRaw<
            { id: number; type: HappeningType }[]
        >`
            SELECT "Happening".id, "Happening".type FROM "Happening"
            INNER JOIN "User" ON "User".id = "Happening"."authorId"
            WHERE LOWER("User".username) LIKE ${theThing} OR
            LOWER("Happening".title) LIKE ${theThing} OR
            LOWER("Happening".description) LIKE ${theThing} OR
            LOWER("Happening"."mapName") LIKE ${theThing}
            LIMIT ${PER_PAGE} OFFSET ${opts.page * PER_PAGE}
        `;

        for (let i = 0; i < happenings.length; i++) {
            const happening = happenings[i];

            if (happening.type == 'Run') {
                const run = await this.happeningsService.getRunById(
                    happening.id,
                    userId,
                );

                if (run) searchResult.push({ type: 'run', ...run });
            } else if ((happening.type = 'Event')) {
                const event = await this.happeningsService.getEventById(
                    happening.id,
                    userId,
                );

                if (event) searchResult.push({ type: 'event', ...event });
            }
        }

        return {
            results: searchResult,
            next: Math.ceil(totalCount / PER_PAGE) - 1 > opts.page,
        };
    }
}
