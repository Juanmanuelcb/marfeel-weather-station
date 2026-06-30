import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { fetchDevice } from '../../api.js';

export const Debug = () => {
	const { deviceId } = useParams();
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		fetchDevice(`device_${deviceId}`).then(setData);
	}, [deviceId]);

	return <pre>{JSON.stringify(data, null, 2)}</pre>;
};
