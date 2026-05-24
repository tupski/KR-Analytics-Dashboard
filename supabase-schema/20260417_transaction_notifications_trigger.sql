-- Trigger untuk notifikasi transaksi baru
CREATE OR REPLACE FUNCTION public.handle_new_transaction_notification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (
        type,
        title,
        body,
        audience_role,
        data
    ) VALUES (
        'new_transaction',
        'Transaksi Baru!',
        'Customer ' || NEW.customer_name || ' di ' || NEW.apartment_location || ' - ' || NEW.room_number,
        'admin', -- Admin dan Super Admin akan menerima notifikasi ini
        jsonb_build_object(
            'transaction_id', NEW.id,
            'location', NEW.apartment_location,
            'room', NEW.room_number
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_transaction_inserted ON public.transactions;

-- Create trigger
CREATE TRIGGER on_transaction_inserted
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_new_transaction_notification();
