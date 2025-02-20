import { Injectable, Param } from '@nestjs/common';
import { HappeningType } from '@prisma/client';
import { HappeningsService } from 'src/happenings/happenings.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Profile } from '@app/shared/types/Profile.type';
import { User } from '@app/shared/types/User.type';
import { createFile, deleteFile, FileTypeEnum } from 'src/utils/file.util';
import { RegisterUserDTO } from './dto/register-user.dto';
import * as argon2 from 'argon2';
import { Run, Event } from '@app/shared/types/Happening.type';
import { getAvatarUrl } from 'src/utils/user.util';
import { getPermissions } from 'src/utils/permissions.util';

@Injectable()
export class UsersService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly happeningService: HappeningsService,
        private readonly notificationsService: NotificationsService,
    ) { }

    async isUserExists(
        args: Parameters<UsersService['prismaService']['user']['count']>[0],
    ): Promise<boolean> {
        return this.prismaService.exists(this.prismaService.user, args);
    }

    async getUserByEmail(email: string) {
        return this.prismaService.user.findFirst({
            where: {
                email,
            },
        });
    }

    async getUserCredentials(id: number): Promise<User> {
        const {
            id: userId,
            username,
            tier,
            email,
            createdAt,
            updatedAt,
            roles,
            verified,
            ...credentials
        } = (await this.prismaService.user.findFirst({
            where: {
                id,
            },
            select: {
                id: true,
                username: true,
                email: true,
                tier: true,
                createdAt: true,
                updatedAt: true,
                verified: true,
                avatar: true,
                roles: {
                    select: {
                        role: {
                            select: {
                                canBan: true,
                                canManagePosts: true,
                                canManageRoles: true,
                                canDeleteHappenings: true,
                            },
                        },
                    },
                },
                bans: {
                    take: 1,
                    select: {
                        reason: true,
                    },
                },
            },
        }))!; //NOTE: this is fine

        const unreadNotificationsCount =
            await this.prismaService.notification.count({
                where: {
                    userId: id,
                    seen: false,
                },
            });

        const notifications =
            await this.notificationsService.getUserNotifications(id);

        let banned: User['banned'] = {
            isBanned: false,
            reason: null,
        };

        if (credentials.bans.length) {
            banned.isBanned = true;
            banned.reason = credentials.bans[0].reason;
        }

        const permissions = getPermissions(roles.map(el => el.role));

        return {
            id,
            username,
            tier,
            email,
            avatar: getAvatarUrl(credentials.avatar),
            notifications,
            updatedAt: updatedAt.toString(),
            createdAt: updatedAt.toString(),
            permissions,
            banned,
            verified,
            _count: { unreadNotifications: unreadNotificationsCount },
        };
    }

    async register(data: RegisterUserDTO): Promise<void> {
        await this.prismaService.user.create({
            data,
        });
    }

    /*
     * userId - id of user youre trying to find
     * id - if of user who is looking for it
     */
    async searchUserById(userId: number, id: number) {
        return (await this.prismaService.user.findFirst({
            where: {
                id,
            },
            select: {
                id: true,
                username: true,
                avatar: true,
                tier: true,
                verified: true,
                _count: {
                    select: {
                        followers: true,
                        following: true,
                    },
                },
            },
        }))!; //NOTE: this is fine
    }

    async getUserProfile(userId: number, id: number): Promise<null | Profile> {
        const profile = await this.prismaService.user.findFirst({
            where: {
                id,
            },
            select: {
                id: true,
                username: true,
                avatar: true,
                createdAt: true,
                roles: {
                    select: {
                        role: {
                            select: {
                                id: true,
                                name: true,
                                color: true,
                                url: true,
                            },
                        },
                    },
                },
                tier: true,
                verified: true,
                reviews: {
                    take: 5,
                    select: {
                        id: true,
                        review: true,
                        rate: true,
                        createdAt: true,
                        author: {
                            select: {
                                id: true,
                                username: true,
                                avatar: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        followers: true,
                        following: true,
                    },
                },
                bans: {
                    take: 1,
                    select: {
                        banned: true
                    },
                    where: {
                        banned: true
                    }
                }
            },
        });

        if (!profile) {
            return null;
        }

        const {
            id: profileUserId,
            avatar,
            verified,
            createdAt,
            tier,
            username,
            _count: { followers, following },
        } = profile;

        const runIds = await this.happeningService.getRecentRunsIds(id);
        const eventIds = await this.happeningService.getRecentEventsIds(id);

        const events: Event[] = [];
        const runs: Run[] = [];

        for (const runId of runIds) {
            const run = await this.happeningService.getRunById(
                userId,
                runId.id,
            );

            if (run) {
                runs.push(run);
            }
        }

        for (const eventId of eventIds) {
            const event = await this.happeningService.getEventById(
                userId,
                eventId.id,
            );

            if (event) {
                events.push(event);
            }
        }

        const playedRuns =
            await this.happeningService.countLastFinishedHappenings(
                id,
                HappeningType.Run,
            );
        const playedEvents =
            await this.happeningService.countLastFinishedHappenings(
                id,
                HappeningType.Event,
            );

        const isFollowing = await this.isFollowing(userId, id);

        const reviews: Profile['reviews'] = [];

        for (const review of profile.reviews) {
            reviews.push({
                ...review,
                createdAt: createdAt.toString(),
            });
        }

        const roles = profile.roles.map((el) => el.role);
        const isReported = await this.isReported(id, userId);

        //TODO: return boolean only to users who can ban
        //return null for others

        return {
            id: profileUserId,
            reviews,
            username,
            tier,
            roles,
            createdAt: createdAt.toString(),
            verified,
            avatar: getAvatarUrl(avatar),
            happenings: {
                runs,
                events,
            },
            _count: {
                followers,
                following,
                playedRuns,
                playedEvents,
            },
            isFollowing,
            isReported,
            isBanned: profile.bans[0]?.banned ? true : false,
        };
    }

    async isFollowing(followerId: number, followingId: number): Promise<boolean> {
        const bool = await this.prismaService.follower.count({
            where: {
                followerId,
                followingId,
            },
        });

        return Boolean(bool);
    }

    async follow(followerId: number, followingId: number): Promise<void> {
        if (await this.isFollowing(followerId, followingId)) {
            // unfollow
            await this.prismaService.follower.delete({
                where: {
                    followerId_followingId: {
                        followerId,
                        followingId,
                    },
                },
            });
        } else {
            //follow
            await this.prismaService.follower.create({
                data: {
                    followerId,
                    followingId,
                },
            });
        }
    }

    async updateAvatar(id: number, avatar: Express.Multer.File): Promise<string> {
        const filename = await createFile(avatar, FileTypeEnum.Avatar);
        const oldAvatar = (await this.prismaService.user.findFirst({
            where: {
                id,
            },
            select: {
                avatar: true,
            },
        }))!;

        if (oldAvatar.avatar)
            await deleteFile(oldAvatar.avatar, FileTypeEnum.Avatar);

        await this.prismaService.user.update({
            where: {
                id,
            },
            data: {
                avatar: filename,
            },
        });

        return filename;
    }

    async updateUsername(
        id: number,
        data: { username: string; password: string },
    ): Promise<boolean> {
        const { password } = (await this.prismaService.user.findFirst({
            where: {
                id,
            },
        }))!;

        if (await argon2.verify(password, data.password)) {
            await this.prismaService.user.update({
                where: { id },
                data: {
                    username: data.username,
                },
            });

            return true;
        } else {
            return false;
        }
    }

    async updateEmail(id: number, data: { email: string; password: string }): Promise<boolean> {
        const { password } = (await this.prismaService.user.findFirst({
            where: {
                id,
            },
        }))!;

        if (await argon2.verify(password, data.password)) {
            await this.prismaService.user.update({
                where: { id },
                data: {
                    email: data.email,
                },
            });

            return true;
        } else {
            return false;
        }
    }

    async updatePassword(id: number, data: { old: string; new: string }): Promise<boolean> {
        const { password } = (await this.prismaService.user.findFirst({
            where: {
                id,
            },
        }))!;

        if (await argon2.verify(password, data.old)) {
            await this.prismaService.user.update({
                where: { id },
                data: {
                    password: await argon2.hash(data.new),
                },
            });

            return true;
        } else {
            return false;
        }
    }

    async report(reportedUserId: number, authorId: number, reason: string): Promise<void> {
        await this.prismaService.report.create({
            data: {
                reportedUserId,
                authorId,
                report: reason
            }
        });
    }

    async isReported(reportedUserId: number, authorId: number): Promise<boolean> {
        let res = await this.prismaService.report.findFirst({
            where: {
                authorId,
                reportedUserId
            }
        });

        return res === null ? false : true;
    }

    async isBanned(bannedUserId: number): Promise<boolean> {
        let res = await this.prismaService.ban.findFirst({
            where: {
                userId: bannedUserId,
                banned: true
            },
        });

        return res === null ? false : true;
    }

    async ban(userIdToBan: number, authorId: number, reason: string): Promise<void> {
        await this.prismaService.ban.create({
            data: {
                reason,
                banned: true,
                userId: userIdToBan,
                authorId
            }
        });
    }

    async unban(bannedUserId: number): Promise<void> {
        const ban = await this.prismaService.ban.findFirst({
            where: {
                userId: bannedUserId,
                banned: true
            },
            select: {
                id: true
            }
        });

        await this.prismaService.ban.update({
            where: {
                id: ban!.id
            },
            data: {
                banned: false
            }
        });
    }
}
