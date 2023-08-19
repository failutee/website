import { Injectable } from '@nestjs/common';
import { HappeningType } from '@prisma/client';
import { HappeningsService } from 'src/happenings/happenings.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Profile } from 'src/types/Profile.type';
import { User } from 'src/types/User.type';
import { computePersmissions } from 'src/utils/computedFields';
import { createFile, deleteFile, FileTypeEnum } from 'src/utils/file.util';
import { RegisterUserDTO } from './dto/register-user.dto';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly happeningService: HappeningsService,
        private readonly notificationsService: NotificationsService,
    ) { }

    async isUserExists(
        args: Parameters<UsersService['prismaService']['user']['count']>[0],
    ): Promise<Boolean> {
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
        const credentials = (await this.prismaService.user.findFirst({
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

        let avatar: string | null = null;

        if (credentials.avatar) {
            avatar = `${process.env.BASE_URL}/${process.env.AVATAR_PATH}/${credentials.avatar}`;

        }

        const res = {
            ...credentials,
            avatar,
            notifications,
            _count: { unreadNotifications: unreadNotificationsCount },
        };

        return computePersmissions(res);
    }

    async register(data: RegisterUserDTO) {
        return await this.prismaService.user.create({
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
        const profile = (await this.prismaService.user.findFirst({
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
            },
        }))!; //NOTE: this is fine

        const runs = await this.happeningService.getRecentRuns(id);
        const events = await this.happeningService.getRecentEvents(id);

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

        return {
            ...profile,
            happenings: {
                runs,
                events,
            },
            _count: {
                ...profile?._count,
                playedRuns,
                playedEvents,
            },
            isFollowing,
        };
    }

    async isFollowing(followerId: number, followingId: number) {
        const bool = await this.prismaService.follower.count({
            where: {
                followerId,
                followingId,
            },
        });

        return Boolean(bool);
    }

    async follow(followerId: number, followingId: number) {
        if (await this.isFollowing(followerId, followingId)) {
            // unfollow
            return await this.prismaService.follower.delete({
                where: {
                    followerId_followingId: {
                        followerId,
                        followingId,
                    },
                },
            });
        } else {
            //follow
            return await this.prismaService.follower.create({
                data: {
                    followerId,
                    followingId,
                },
            });
        }
    }

    async updateAvatar(id: number, avatar: Express.Multer.File) {
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
    ) {
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

    async updateEmail(id: number, data: { email: string; password: string }) {
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

    async updatePassword(id: number, data: { old: string; new: string }) {
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
}
