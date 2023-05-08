import { Avatar } from '@/components/Avatar';
import { ChangeUsernameModal } from '@/components/ChangeUsernameModal';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { SettingsLayout } from '@/components/SettingsLayout';
import { Button } from '@/components/ui/Button';
import { useUpdateAvatarMutation } from '@/features/api/users.api';
import { useAppSelector } from '@/utils/hooks/hooks';
import { useRef, useState } from 'react';

export default function Account() {
    const ref = useRef<HTMLInputElement>(null);
    const [updateAvatar] = useUpdateAvatarMutation();
    const [isChangeUsernameModalVisible, setIsChangeUsernameModalVisible] =
        useState(false);
    const [isDeleteAccountModalVisible, setIsDeleteAccountModalVisible] =
        useState(false);
    const user = useAppSelector(state => state.user.user);

    const changeAvatar = () => {
        ref.current?.click();
    };

    const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (e.target?.files?.length) {
                const formData = new FormData();

                formData.append('avatar', e.target?.files[0]);

                await updateAvatar(formData);
            }
        } catch (e) {
            console.log(e);
        }
    };

    const changeUsername = () => {
        setIsChangeUsernameModalVisible(true);
    };

    const deleteAccount = () => {
        setIsDeleteAccountModalVisible(true);
    };

    return (
        <SettingsLayout>
            <ChangeUsernameModal
                visible={isChangeUsernameModalVisible}
                onClose={() => setIsChangeUsernameModalVisible(false)}
            />
            <DeleteAccountModal
                visible={isDeleteAccountModalVisible}
                onClose={() => setIsDeleteAccountModalVisible(false)}
            />
            <div className="flex items-center">
                <div className="relative">
                    <Avatar src={user.avatar} username={user.username || ''} size={200} />
                    <input
                        ref={ref}
                        type="file"
                        onChange={onChange}
                        className="hidden"
                    />
                    <div
                        className="hover:opacity-100 transition-opacity duration-300 select-none opacity-0 rounded-full inset-0  absolute uppercase flex justify-center items-center bg-[#000]/70 text-high-emphasis text-2xl font-medium cursor-pointer"
                        onClick={changeAvatar}
                    >
                        Change
                        <br /> Avatar
                    </div>
                </div>
                <div className="grow ml-7 bg-primary-2 p-5 rounded-[10px]">
                    <div className="flex w-full justify-between">
                        <div>
                            <p className="uppercase font-semibold text-[12px] text-medium-emphasis">
                                username
                            </p>
                            <p className="text-high-emphasis">MilkeeyCat</p>
                        </div>
                        <Button
                            styleType={'filled'}
                            onClick={changeUsername}
                            className="text-sm"
                        >
                            Edit
                        </Button>
                    </div>
                    <div className="flex w-full justify-between mt-7">
                        <div>
                            <p className="uppercase font-semibold text-[12px] text-medium-emphasis">
                                email
                            </p>
                            <p className="text-high-emphasis">deez@nuts.com</p>
                        </div>
                        <Button styleType={'filled'} className="text-sm">
                            Edit
                        </Button>
                    </div>
                </div>
            </div>
            <div className="mt-[50px]">
                <p className="text-xl text-high-emphasis">
                    Password and Authentication
                </p>
                <Button styleType="filled" className="text-sm mt-5">
                    Change Password
                </Button>
            </div>
            <div className="mt-[50px]">
                <p className="text-xl text-high-emphasis">Account removal</p>
                <p className="text-sm text-medium-emphasis">
                    If you remove your account it’s gg. You wont be able to
                    restore it!
                </p>
                <Button
                    styleType="filled"
                    onClick={deleteAccount}
                    className="text-sm mt-5 !bg-error"
                >
                    Delete Account
                </Button>
            </div>
        </SettingsLayout>
    );
}
